// Package api is the generated HTTP client for the backend operations tagged
// "bridge" in schema/api-v1.yaml. Regenerate with `npm run gen:api` at the repo root.
package api

//go:generate go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.4.1 -config oapi-codegen.yaml ../../../backend/src/schema/api-v1.bundled.json

// github.com/oapi-codegen/runtime (this generated client's only non-stdlib dependency) is
// pinned at v1.2.0 in go.mod: newer versions require go >= 1.24, which would bump our toolchain.
