# --- Этап сборки ---
# Используем официальный образ Node.js для сборки приложения
FROM node:20-alpine AS build

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем package.json и package-lock.json (или yarn.lock)
# Это позволяет Docker кэшировать установку зависимостей
COPY package.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем остальной код приложения
COPY . .

# Собираем приложение для продакшена
RUN npm run build

# --- Этап продакшена ---
# Используем легковесный образ Nginx для обслуживания статических файлов
FROM nginx:alpine

# Копируем собранные статические файлы из этапа сборки в директорию Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Копируем пользовательский файл конфигурации Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Открываем порт 80 для входящих соединений
EXPOSE 80

# Запускаем Nginx
CMD ["nginx", "-g", "daemon off;"]