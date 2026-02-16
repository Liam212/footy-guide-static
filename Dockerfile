FROM nginx:alpine

ARG API_URL
ARG POSTHOG_KEY
ARG POSTHOG_HOST
ARG ENVIROMENT=development
ENV API_URL=${API_URL}
ENV POSTHOG_KEY=${POSTHOG_KEY}
ENV POSTHOG_HOST=${POSTHOG_HOST}
ENV ENVIROMENT=${ENVIROMENT}

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/

RUN apk add --no-cache gettext \
  && find /usr/share/nginx/html -type f -name "*.html" \
  | xargs -I{} sh -c 'envsubst < "{}" > "{}.tmp" && mv "{}.tmp" "{}"'

EXPOSE 80
