import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Map, View } from 'ol';
import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import { get as getProjection } from 'ol/proj';
import { getCenter } from 'ol/extent';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import Circle from 'ol/geom/Circle';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import { Coordinate } from 'ol/coordinate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { showSuccess, showError } from '@/utils/toast';
import { Draw, Modify, Snap } from 'ol/interaction';

interface Beacon {
  id: string;
  position: Coordinate; // [x, y] in map coordinates (meters)
  rssi?: number;
}

interface Antenna {
  id: string;
  position: Coordinate; // [x, y] in map coordinates (meters)
  height: number; // Height of installation in meters
  angle: number; // Angle of algorithm operation (degrees)
  range: number; // Coverage radius in meters
}

interface MapDisplayProps {
  mapImageSrc: string;
  mapWidthMeters: number;
  mapHeightMeters: number;
  onBeaconsChange: (beacons: Beacon[]) => void;
  initialBeacons?: Beacon[];
}

const MapDisplay: React.FC<MapDisplayProps> = ({
  mapImageSrc,
  mapWidthMeters,
  mapHeightMeters,
  onBeaconsChange,
  initialBeacons = [],
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<Map | null>(null);
  const [beacons, setBeacons] = useState<Beacon[]>(initialBeacons);
  const [antennas, setAntennas] = useState<Antenna[]>([]);

  const [isManualBeaconPlacementMode, setIsManualBeaconPlacementMode] = useState(false);
  const [isManualAntennaPlacementMode, setIsManualAntennaPlacementMode] = useState(false);
  const [isDrawingBarrierMode, setIsDrawingBarrierMode] = useState(false);

  const [autoRssi, setAutoRssi] = useState(70);
  const [autoBeaconStep, setAutoBeaconStep] = useState(5);

  const [autoAntennaHeight, setAutoAntennaHeight] = useState(2);
  const [autoAntennaAngle, setAutoAntennaAngle] = useState(0);

  // State for layer visibility
  const [showBeacons, setShowBeacons] = useState(true);
  const [showAntennas, setShowAntennas] = useState(true);
  const [showBarriers, setShowBarriers] = useState(true);

  const calculatedAntennaRange = Math.max(
    10, // Default to 10m if calculation yields less
    5 + (autoAntennaHeight * 2) + (autoAntennaAngle / 360 * 5) // Example calculation
  );
  const calculatedAntennaStep = calculatedAntennaRange * 0.75;

  const beaconVectorSource = useRef(new VectorSource({ features: [] }));
  const beaconVectorLayer = useRef(new VectorLayer({ source: beaconVectorSource.current }));

  const antennaVectorSource = useRef(new VectorSource({ features: [] }));
  const antennaVectorLayer = useRef(new VectorLayer({ source: antennaVectorSource.current }));

  const barrierVectorSource = useRef(new VectorSource({ features: [] }));
  const barrierVectorLayer = useRef(new VectorLayer({ source: barrierVectorSource.current }));

  const drawInteraction = useRef<Draw | null>(null);
  const modifyInteraction = useRef<Modify | null>(null);
  const snapInteraction = useRef<Snap | null>(null);

  const beaconStyle = new Style({
    image: new Icon({
      anchor: [0.5, 1],
      src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="red" width="24px" height="24px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
      scale: 1.5,
    }),
  });

  const getAntennaStyle = useCallback((feature: Feature) => {
    const range = feature.get('range');
    const position = feature.getGeometry()?.getCoordinates();

    if (!position || range === undefined) {
      return new Style();
    }

    return [
      new Style({
        image: new Icon({
          anchor: [0.5, 1],
          src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="blue" width="24px" height="24px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
          scale: 1.5,
        }),
      }),
      new Style({
        geometry: new Circle(position, range),
        fill: new Fill({
          color: 'rgba(0, 0, 255, 0.1)',
        }),
        stroke: new Stroke({
          color: 'blue',
          width: 1,
        }),
      }),
    ];
  }, []);

  const barrierStyle = new Style({
    fill: new Fill({
      color: 'rgba(255, 0, 0, 0.3)',
    }),
    stroke: new Stroke({
      color: 'red',
      width: 2,
    }),
  });

  useEffect(() => {
    if (!mapRef.current) return;

    const extent = [0, 0, mapWidthMeters, mapHeightMeters];
    const projection = getProjection('EPSG:3857');

    const imageLayer = new ImageLayer({
      source: new ImageStatic({
        url: mapImageSrc,
        imageExtent: extent,
        projection: projection,
      }),
      style: new Style({
        stroke: new Stroke({
          color: 'rgba(0, 0, 0, 0.5)',
          width: 2,
        }),
      }),
    });

    const initialMap = new Map({
      target: mapRef.current,
      layers: [imageLayer, beaconVectorLayer.current, antennaVectorLayer.current, barrierVectorLayer.current],
      view: new View({
        center: getCenter(extent),
        extent: extent,
        zoom: 0,
        showFullExtent: true,
      }),
    });

    setMapInstance(initialMap);

    return () => {
      initialMap.setTarget(undefined);
    };
  }, [mapImageSrc, mapWidthMeters, mapHeightMeters]);

  // Effect to update layer visibility
  useEffect(() => {
    if (mapInstance) {
      beaconVectorLayer.current.setVisible(showBeacons);
      antennaVectorLayer.current.setVisible(showAntennas);
      barrierVectorLayer.current.setVisible(showBarriers);
    }
  }, [mapInstance, showBeacons, showAntennas, showBarriers]);

  useEffect(() => {
    beaconVectorSource.current.clear();
    beacons.forEach(beacon => {
      const feature = new Feature({
        geometry: new Point(beacon.position),
        id: beacon.id,
      });
      feature.setStyle(beaconStyle);
      beaconVectorSource.current.addFeature(feature);
    });
    onBeaconsChange(beacons);
  }, [beacons, onBeaconsChange]);

  useEffect(() => {
    antennaVectorSource.current.clear();
    antennas.forEach(antenna => {
      const feature = new Feature({
        geometry: new Point(antenna.position),
        id: antenna.id,
        height: antenna.height,
        angle: antenna.angle,
        range: antenna.range,
      });
      feature.setStyle(getAntennaStyle(feature));
      antennaVectorSource.current.addFeature(feature);
    });
  }, [antennas, getAntennaStyle]);

  const handleMapClick = useCallback((event: any) => {
    if (!mapInstance) return;

    const coordinate = event.coordinate;

    if (isManualBeaconPlacementMode) {
      const newBeacon: Beacon = {
        id: `beacon-${Date.now()}`,
        position: coordinate,
      };
      setBeacons((prev) => [...prev, newBeacon]);
      showSuccess('Маяк добавлен вручную!');
    } else if (isManualAntennaPlacementMode) {
      const newAntenna: Antenna = {
        id: `antenna-${Date.now()}`,
        position: coordinate,
        height: autoAntennaHeight,
        angle: autoAntennaAngle,
        range: calculatedAntennaRange,
      };
      setAntennas((prev) => [...prev, newAntenna]);
      showSuccess('Антенна добавлена вручную!');
    }
  }, [isManualBeaconPlacementMode, isManualAntennaPlacementMode, mapInstance, autoAntennaHeight, autoAntennaAngle, calculatedAntennaRange]);

  useEffect(() => {
    if (mapInstance) {
      mapInstance.un('click', handleMapClick);
      if (isManualBeaconPlacementMode || isManualAntennaPlacementMode) {
        mapInstance.on('click', handleMapClick);
      }
    }
  }, [mapInstance, isManualBeaconPlacementMode, isManualAntennaPlacementMode, handleMapClick]);

  // Effect to manage Draw, Modify, and Snap interactions for barriers
  useEffect(() => {
    if (!mapInstance) return;

    // Clean up all previous interactions related to barriers
    if (drawInteraction.current) {
      mapInstance.removeInteraction(drawInteraction.current);
      drawInteraction.current = null;
    }
    if (modifyInteraction.current) {
      mapInstance.removeInteraction(modifyInteraction.current);
      modifyInteraction.current = null;
    }
    if (snapInteraction.current) {
      mapInstance.removeInteraction(snapInteraction.current);
      snapInteraction.current = null;
    }

    if (isDrawingBarrierMode) {
      // When in drawing mode, only add Draw and Snap
      drawInteraction.current = new Draw({
        source: barrierVectorSource.current,
        type: 'Polygon',
        style: barrierStyle,
      });
      mapInstance.addInteraction(drawInteraction.current);

      snapInteraction.current = new Snap({ source: barrierVectorSource.current });
      mapInstance.addInteraction(snapInteraction.current);

      drawInteraction.current.on('drawend', (event) => {
        event.feature.setStyle(barrierStyle);
        showSuccess('Барьер добавлен!');
      });
    } else {
      // When not in drawing mode, add Modify and Snap for editing existing barriers
      modifyInteraction.current = new Modify({ source: barrierVectorSource.current });
      mapInstance.addInteraction(modifyInteraction.current);

      snapInteraction.current = new Snap({ source: barrierVectorSource.current });
      mapInstance.addInteraction(snapInteraction.current);
    }
  }, [mapInstance, isDrawingBarrierMode]);


  const handleAutoPlaceBeacons = () => {
    const newBeacons: Beacon[] = [];
    let idCounter = 0;

    const barrierGeometries = barrierVectorSource.current.getFeatures().map(f => f.getGeometry());

    for (let y = autoBeaconStep / 2; y < mapHeightMeters; y += autoBeaconStep) {
      for (let x = autoBeaconStep / 2; x < mapWidthMeters; x += autoBeaconStep) {
        const beaconPoint = new Point([x, y]);
        let isInsideBarrier = false;
        for (const barrierGeom of barrierGeometries) {
          if (barrierGeom instanceof Polygon && barrierGeom.intersectsCoordinate(beaconPoint.getCoordinates())) {
            isInsideBarrier = true;
            break;
          }
        }

        if (!isInsideBarrier) {
          newBeacons.push({
            id: `beacon-auto-${idCounter++}`,
            position: [x, y],
            rssi: autoRssi,
          });
        }
      }
    }
    setBeacons(newBeacons);
    setIsManualBeaconPlacementMode(false);
    setIsManualAntennaPlacementMode(false);
    setIsDrawingBarrierMode(false);
    showSuccess(`Автоматически размещено ${newBeacons.length} маяков (с учетом барьеров).`);
  };

  const handleAutoPlaceAntennas = () => {
    const newAntennas: Antenna[] = [];
    let idCounter = 0;

    const barrierGeometries = barrierVectorSource.current.getFeatures().map(f => f.getGeometry());

    for (let y = calculatedAntennaStep / 2; y < mapHeightMeters; y += calculatedAntennaStep) {
      for (let x = calculatedAntennaStep / 2; x < mapWidthMeters; x += calculatedAntennaStep) {
        const antennaPoint = new Point([x, y]);
        let isInsideBarrier = false;
        for (const barrierGeom of barrierGeometries) {
          if (barrierGeom instanceof Polygon && barrierGeom.intersectsCoordinate(antennaPoint.getCoordinates())) {
            isInsideBarrier = true;
            break;
          }
        }

        if (!isInsideBarrier) {
          newAntennas.push({
            id: `antenna-auto-${idCounter++}`,
            position: [x, y],
            height: autoAntennaHeight,
            angle: autoAntennaAngle,
            range: calculatedAntennaRange,
          });
        }
      }
    }
    setAntennas(newAntennas);
    setIsManualBeaconPlacementMode(false);
    setIsManualAntennaPlacementMode(false);
    setIsDrawingBarrierMode(false);
    showSuccess(`Автоматически размещено ${newAntennas.length} антенн (с учетом барьеров).`);
  };

  const handleClearBeacons = () => {
    setBeacons([]);
    showSuccess('Все маяки удалены.');
  };

  const handleClearAntennas = () => {
    setAntennas([]);
    showSuccess('Все антенны удалены.');
  };

  const handleClearBarriers = () => {
    barrierVectorSource.current.clear();
    showSuccess('Все барьеры удалены.');
  };

  const handleExportMapToPNG = () => {
    if (!mapInstance || !mapRef.current) {
      showError('Карта не инициализирована или контейнер карты не найден.');
      return;
    }

    mapInstance.once('rendercomplete', () => {
      try {
        // Ищем холст напрямую внутри элемента, на который ссылается mapRef
        const mapCanvas = mapRef.current.querySelector('canvas') as HTMLCanvasElement;
        if (!mapCanvas) {
          showError('Не удалось найти холст карты.');
          return;
        }

        const link = document.createElement('a');
        link.download = 'map_export.png';
        link.href = mapCanvas.toDataURL('image/png');
        link.click();
        showSuccess('Карта успешно экспортирована в PNG!');
      } catch (error) {
        console.error('Ошибка при экспорте карты:', error);
        showError('Ошибка при экспорте карты. Возможно, из-за ограничений безопасности браузера (CORS) для изображений.');
      }
    });
    mapInstance.renderSync(); // Принудительная синхронная отрисовка для захвата
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setIsManualBeaconPlacementMode(!isManualBeaconPlacementMode);
            setIsManualAntennaPlacementMode(false);
            setIsDrawingBarrierMode(false);
          }}
          variant={isManualBeaconPlacementMode ? 'destructive' : 'default'}
        >
          {isManualBeaconPlacementMode ? 'Выйти из режима ручной расстановки маяков' : 'Включить ручную расстановку маяков'}
        </Button>
        <Button
          onClick={() => {
            setIsManualAntennaPlacementMode(!isManualAntennaPlacementMode);
            setIsManualBeaconPlacementMode(false);
            setIsDrawingBarrierMode(false);
          }}
          variant={isManualAntennaPlacementMode ? 'destructive' : 'default'}
        >
          {isManualAntennaPlacementMode ? 'Выйти из режима ручной расстановки антенн' : 'Включить ручную расстановку антенн'}
        </Button>
        <Button
          onClick={() => {
            setIsDrawingBarrierMode(!isDrawingBarrierMode);
            setIsManualBeaconPlacementMode(false);
            setIsManualAntennaPlacementMode(false);
          }}
          variant={isDrawingBarrierMode ? 'destructive' : 'default'}
        >
          {isDrawingBarrierMode ? 'Выйти из режима рисования барьеров' : 'Включить рисование барьеров'}
        </Button>
        <Button onClick={handleClearBeacons} variant="outline">
          Очистить все маяки
        </Button>
        <Button onClick={handleClearAntennas} variant="outline">
          Очистить все антенны
        </Button>
        <Button onClick={handleClearBarriers} variant="outline">
          Очистить все барьеры
        </Button>
        <Button onClick={handleExportMapToPNG} variant="secondary">
          Экспорт карты в PNG
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-md">
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoRssi">RSSI для авто-расстановки маяков ({autoRssi} dBm)</Label>
          <Slider
            id="autoRssi"
            min={-100}
            max={-30}
            step={1}
            value={[autoRssi]}
            onValueChange={(val) => setAutoRssi(val[0])}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoBeaconStep">Шаг расстановки маяков (метры: {autoBeaconStep} м)</Label>
          <Slider
            id="autoBeaconStep"
            min={1}
            max={50}
            step={1}
            value={[autoBeaconStep]}
            onValueChange={(val) => setAutoBeaconStep(val[0])}
          />
        </div>
        <Button onClick={handleAutoPlaceBeacons} className="col-span-full">
          Автоматически расставить маяки
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-md">
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoAntennaHeight">Высота антенн (метры: {autoAntennaHeight} м)</Label>
          <Input
            id="autoAntennaHeight"
            type="number"
            value={autoAntennaHeight}
            onChange={(e) => setAutoAntennaHeight(Number(e.target.value))}
            min="0"
            step="0.1"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="autoAntennaAngle">Угол антенн (градусы: {autoAntennaAngle}°)</Label>
          <Input
            id="autoAntennaAngle"
            type="number"
            value={autoAntennaAngle}
            onChange={(e) => setAutoAntennaAngle(Number(e.target.value))}
            min="0"
            max="360"
            step="1"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Радиус покрытия антенн (метры: {calculatedAntennaRange.toFixed(2)} м)</Label>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Шаг расстановки антенн (метры: {calculatedAntennaStep.toFixed(2)} м)</Label>
        </div>
        <Button onClick={handleAutoPlaceAntennas} className="col-span-full">
          Автоматически расставить антенны
        </Button>
      </div>

      {/* Layer Management Section */}
      <div className="p-4 border rounded-md flex flex-col sm:flex-row gap-4 sm:gap-8 items-start sm:items-center">
        <h3 className="text-lg font-semibold">Управление слоями:</h3>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showBeacons"
            checked={showBeacons}
            onCheckedChange={(checked) => setShowBeacons(Boolean(checked))}
          />
          <Label htmlFor="showBeacons">Показать маяки</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showAntennas"
            checked={showAntennas}
            onCheckedChange={(checked) => setShowAntennas(Boolean(checked))}
          />
          <Label htmlFor="showAntennas">Показать антенны</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showBarriers"
            checked={showBarriers}
            onCheckedChange={(checked) => setShowBarriers(Boolean(checked))}
          />
          <Label htmlFor="showBarriers">Показать барьеры</Label>
        </div>
      </div>

      <div ref={mapRef} className="w-full h-[600px] border rounded-md" />

      {beacons.length > 0 && (
        <div className="mt-4 p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Размещенные маяки:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {beacons.map((beacon) => (
              <div key={beacon.id} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-sm text-sm">
                ID: {beacon.id.substring(0, 8)}... <br />
                Позиция: ({beacon.position[0].toFixed(2)}м, {beacon.position[1].toFixed(2)}м)
                {beacon.rssi && <><br />RSSI: {beacon.rssi} dBm</>}
              </div>
            ))}
          </div>
        </div>
      )}

      {antennas.length > 0 && (
        <div className="mt-4 p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Размещенные антенны:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {antennas.map((antenna) => (
              <div key={antenna.id} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-sm text-sm">
                ID: {antenna.id.substring(0, 8)}... <br />
                Позиция: ({antenna.position[0].toFixed(2)}м, {antenna.position[1].toFixed(2)}м) <br />
                Высота: {antenna.height.toFixed(1)}м, Угол: {antenna.angle}° <br />
                Радиус: {antenna.range.toFixed(1)}м
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapDisplay;