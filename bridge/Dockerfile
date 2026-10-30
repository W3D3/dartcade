FROM golang:1.23-alpine@sha256:383395b794dffa5b53012a212365d40c8e37109a626ca30d6151c8348d380b5f AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Stamp the version: docker build --build-arg VERSION=v0.4.2 (defaults to "dev").
# .git isn't in this context, so dev builds pass COMMIT to get "dev+<sha>".
ARG VERSION=dev
ARG COMMIT=
RUN CGO_ENABLED=0 go build -ldflags "-X main.version=${VERSION} -X main.commit=${COMMIT}" -o bridge ./cmd/bridge

FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
RUN apk add --no-cache ca-certificates
# Persist the paired token + bridge_id across container restarts: mount a
# volume at /data. (Without this, a paired bridge re-pairs on every restart.)
ENV DARTCADE_CONFIG_DIR=/data
COPY --from=build /app/bridge /usr/local/bin/bridge
ENTRYPOINT ["bridge"]
