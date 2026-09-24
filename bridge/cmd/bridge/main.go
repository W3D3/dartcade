package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"syscall"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/transport"
	"github.com/charmbracelet/log"
	"github.com/oklog/ulid/v2"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "replay" {
		runReplay(os.Args[2:])
		return
	}

	fs := flag.NewFlagSet("bridge", flag.ExitOnError)
	boardURL := fs.String("board-url", "", "Board Manager base URL (e.g. http://192.168.1.10:3180)")
	backendURL := fs.String("backend-url", "", "Backend WSS URL")
	bridgeID := fs.String("bridge-id", "", "Stable bridge identifier (auto-generated if empty)")
	logLevel := fs.String("log-level", "", "Log level: debug, info, warn, error")
	fs.Parse(os.Args[1:])

	cfg, err := loadConfig(map[string]string{
		"board_url":   *boardURL,
		"backend_url": *backendURL,
		"bridge_id":   *bridgeID,
		"log_level":   *logLevel,
	})
	if err != nil {
		log.Fatal("config error", "err", err)
	}

	setLogLevel(cfg.LogLevel)
	log.Info("autodarts-bridge starting", "bridge_id", cfg.BridgeID)

	bootID := ulid.Make().String()
	client := bm.NewClient(cfg.BoardURL)

	exec := func(name string) (int, error) {
		ctx := context.Background()
		switch name {
		case "reset":
			return client.Reset(ctx)
		case "start":
			return client.StartDetection(ctx)
		case "stop":
			return client.StopDetection(ctx)
		}
		return 0, nil
	}

	tr := transport.New(transport.Config{
		BackendURL: cfg.BackendURL,
		BridgeID:   cfg.BridgeID,
		BootID:     bootID,
		BoardID:    client.BoardID(),
		BMVersion:  client.BMVersion(),
	}, exec)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := tr.Start(ctx); err != nil && ctx.Err() == nil {
			log.Error("transport stopped", "err", err)
		}
	}()

	eventCh := make(chan []differ.Event, 256)
	go func() {
		for evs := range eventCh {
			tr.Send(evs)
		}
	}()

	go func() {
		if err := client.Start(ctx); err != nil && ctx.Err() == nil {
			log.Error("BM client stopped", "err", err)
		}
		close(eventCh)
	}()

	// Differ loop (main goroutine)
	s := differ.State{}
	for {
		select {
		case <-ctx.Done():
			log.Info("shutting down")
			return
		case frame, ok := <-client.Frames():
			if !ok {
				return
			}
			var evs []differ.Event
			s, evs = differ.Process(s, frame)
			if len(evs) > 0 {
				select {
				case eventCh <- evs:
				default:
					log.Warn("event channel full, dropping batch", "size", len(evs))
				}
			}
		}
	}
}

func setLogLevel(level string) {
	switch level {
	case "debug":
		log.SetLevel(log.DebugLevel)
	case "warn":
		log.SetLevel(log.WarnLevel)
	case "error":
		log.SetLevel(log.ErrorLevel)
	default:
		log.SetLevel(log.InfoLevel)
	}
}
