package bm

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"dartcade/bridge/internal/schema"
)

func relayTo(t *testing.T, h http.HandlerFunc, req schema.BmRequestData) (schema.BmResponseData, []string) {
	t.Helper()
	var hits []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.Method+" "+r.URL.RequestURI())
		h(w, r)
	}))
	defer srv.Close()
	return NewClient(srv.URL).Relay(context.Background(), req), hits
}

func TestRelayStartFallsBackForOlderBoardManagers(t *testing.T) {
	res, hits := relayTo(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/start" {
			http.NotFound(w, r)
		}
	}, schema.BmRequestData{Id: "r1", Op: schema.BmRequestDataOpStart})
	if res.Id != "r1" || res.Status == nil || *res.Status != 200 || res.Error != nil {
		t.Fatalf("got %+v", res)
	}
	if len(hits) != 2 || hits[0] != "PUT /api/start" || hits[1] != "PUT /api/detection/start" {
		t.Fatalf("hits %v", hits)
	}
}

func TestRelayStateAndCamera(t *testing.T) {
	res, _ := relayTo(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"Throw","running":true}`))
	}, schema.BmRequestData{Id: "s", Op: schema.BmRequestDataOpState})
	if res.State["status"] != "Throw" || res.State["running"] != true {
		t.Fatalf("state %+v", res)
	}

	// Board Manager 2 wording comes out as 1.x wording
	res, _ = relayTo(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"takeoutInProgress","event":"throwDetected","running":true}`))
	}, schema.BmRequestData{Id: "s", Op: schema.BmRequestDataOpState})
	if res.State["status"] != "Takeout in progress" || res.State["event"] != "Throw detected" {
		t.Fatalf("state %+v", res)
	}

	cam := 1
	frame := []byte{0xff, 0xd8, 0xff}
	res, hits := relayTo(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(frame)
	}, schema.BmRequestData{Id: "c", Op: schema.BmRequestDataOpCamera, Cam: &cam})
	if res.Image == nil || *res.Image != base64.StdEncoding.EncodeToString(frame) || hits[0] != "GET /api/img/cams/1" {
		t.Fatalf("camera %+v %v", res, hits)
	}

	// Not an image: no frame
	res, _ = relayTo(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("<html>")) },
		schema.BmRequestData{Id: "c", Op: schema.BmRequestDataOpCamera, Cam: &cam})
	if res.Image != nil {
		t.Fatalf("expected no image, got %+v", res)
	}
}

func TestRelayNeverFollowsRedirects(t *testing.T) {
	res, hits := relayTo(t, func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/elsewhere", http.StatusFound)
	}, schema.BmRequestData{Id: "r", Op: schema.BmRequestDataOpReset})
	if res.Status == nil || *res.Status != http.StatusFound || len(hits) != 1 {
		t.Fatalf("got %+v %v", res, hits)
	}
}

func TestRelayReportsAnUnreachableBoardManager(t *testing.T) {
	res := NewClient("http://127.0.0.1:1").Relay(context.Background(), schema.BmRequestData{Id: "x", Op: schema.BmRequestDataOpStop})
	if res.Error == nil || res.Status != nil {
		t.Fatalf("got %+v", res)
	}
}
