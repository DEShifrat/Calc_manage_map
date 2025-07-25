import React, { useState, useCallback } from 'react';
import { MadeWithDyad } from "@/components/made-with-dyad";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MapDisplay from '@/components/MapDisplay';
import { showSuccess, showError } from '@/utils/toast';

interface Beacon {
  id: string;
  position: [number, number]; // [x, y] in map coordinates (meters)
  rssi?: number;
}

const Index = () => {
  const [mapImageFile, setMapImageFile] = useState<File | null>(null);
  const [mapImageSrc, setMapImageSrc] = useState<string | null>(null);
  const [mapWidth, setMapWidth] = useState<number>(100); // Default width in meters
  const [mapHeight, setMapHeight] = useState<number>(100); // Default height in meters
  const [beacons, setBeacons] = useState<Beacon[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setMapImageFile(event.target.files[0]);
      showSuccess('Файл карты выбран.');
    } else {
      setMapImageFile(null);
      setMapImageSrc(null);
    }
  };

  const handleLoadMap = () => {
    if (mapImageFile && mapWidth > 0 && mapHeight > 0) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMapImageSrc(reader.result as string);
        setBeacons([]); // Clear beacons when a new map is loaded
        showSuccess('Карта загружена и готова к использованию!');
      };
      reader.onerror = () => {
        showError('Ошибка при чтении файла карты.');
      };
      reader.readAsDataURL(mapImageFile);
    } else {
      showError('Пожалуйста, выберите файл карты и укажите корректные размеры.');
    }
  };

  const handleBeaconsChange = useCallback((newBeacons: Beacon[]) => {
    setBeacons(newBeacons);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full shadow-lg"> {/* Изменено: удалено max-w-4xl */}
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Управление картами и BLE-маяками</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="mapImage">Загрузить файл карты (изображение)</Label>
              <Input id="mapImage" type="file" accept="image/*" onChange={handleFileChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mapWidth">Ширина карты (метры)</Label>
              <Input
                id="mapWidth"
                type="number"
                value={mapWidth}
                onChange={(e) => setMapWidth(Number(e.target.value))}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mapHeight">Высота карты (метры)</Label>
              <Input
                id="mapHeight"
                type="number"
                value={mapHeight}
                onChange={(e) => setMapHeight(Number(e.target.value))}
                min="1"
              />
            </div>
            <Button onClick={handleLoadMap} className="md:col-span-3">
              Загрузить карту
            </Button>
          </div>

          {mapImageSrc && mapWidth > 0 && mapHeight > 0 ? (
            <MapDisplay
              mapImageSrc={mapImageSrc}
              mapWidthMeters={mapWidth}
              mapHeightMeters={mapHeight}
              onBeaconsChange={handleBeaconsChange}
              initialBeacons={beacons}
            />
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              Пожалуйста, загрузите карту, чтобы начать размещение маяков.
            </div>
          )}
        </CardContent>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default Index;