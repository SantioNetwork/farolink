# Build Step
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve Step
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Fix L-6: Use custom nginx config with CSP and security headers
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

