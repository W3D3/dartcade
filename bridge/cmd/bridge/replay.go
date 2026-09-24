package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"github.com/charmbracelet/log"
)

func runReplay(args []string) {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: bridge replay <file.jsonl>")
		os.Exit(1)
	}
	path := args[0]
	f, err := os.Open(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open %s: %v\n", path, err)
		os.Exit(1)
	}
	defer f.Close()

	s := differ.State{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		frame, err := bm.ParseFrame(line)
		if err != nil {
			log.Warn("parse error", "line", lineNum, "err", err)
			continue
		}
		if frame == nil {
			continue
		}
		var evs []differ.Event
		s, evs = differ.Process(s, *frame)
		for _, ev := range evs {
			out, _ := json.Marshal(map[string]any{"kind": ev.Kind, "data": ev.Data})
			fmt.Println(string(out))
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "scan error: %v\n", err)
		os.Exit(1)
	}
}
