FROM golang:1.23-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Stamp the version: docker build --build-arg VERSION=v0.4.2 (defaults to "dev").
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags "-X main.version=${VERSION}" -o bridge ./cmd/bridge

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
# Persist the paired token + bridge_id across container restarts: mount a
# volume at /data. (Without this, a paired bridge re-pairs on every restart.)
ENV DARTCADE_CONFIG_DIR=/data
COPY --from=build /app/bridge /usr/local/bin/bridge
ENTRYPOINT ["bridge"]
