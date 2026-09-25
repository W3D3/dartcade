FROM golang:1.23-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o bridge ./cmd/bridge

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /app/bridge /usr/local/bin/bridge
ENTRYPOINT ["bridge"]
