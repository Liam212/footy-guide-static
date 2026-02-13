FROM nginx:alpine

ARG API_URL
ARG API_KEY
ENV API_URL=${API_URL}
ENV API_KEY=${API_KEY}

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/

RUN apk add --no-cache gettext \
  && find /usr/share/nginx/html -type f -name "*.html" \
  | xargs -I{} sh -c 'envsubst < "{}" > "{}.tmp" && mv "{}.tmp" "{}"'

EXPOSE 80
