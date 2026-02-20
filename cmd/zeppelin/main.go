package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"

	zeppelin "github.com/gronitab/zeppelin"
	"github.com/gronitab/zeppelin/internal/poller"
	"github.com/gronitab/zeppelin/internal/server"
	"github.com/gronitab/zeppelin/internal/sse"
	"github.com/gronitab/zeppelin/internal/state"
)

func main() {
	port := flag.Int("port", 7331, "HTTP server port")
	root := flag.String("root", defaultRoot(), "Gas Town root directory")
	bind := flag.String("bind", "127.0.0.1", "Bind address")
	flag.Parse()

	store := state.NewStore()
	broker := sse.NewBroker()

	// Set up frontend filesystem from embedded assets.
	frontendFS, err := fs.Sub(zeppelin.FrontendFS, "frontend/dist")
	if err != nil {
		log.Fatalf("failed to load frontend: %v", err)
	}

	srv := server.New(store, broker, frontendFS)

	// Start the poller.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	p := poller.New(store, *root, func() {
		// On state change, broadcast to all SSE clients.
		if broker.ClientCount() > 0 {
			snap := store.GetSnapshot()
			broker.Broadcast(snap)
		}
	})
	go p.Run(ctx)

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	log.Printf("Zeppelin starting on http://%s", addr)
	log.Printf("Gas Town root: %s", *root)

	httpSrv := &http.Server{
		Addr:    addr,
		Handler: srv,
	}

	// Graceful shutdown on interrupt.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, os.Interrupt)
		<-sigCh
		log.Println("Shutting down...")
		cancel()
		httpSrv.Close()
	}()

	if err := httpSrv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func defaultRoot() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "gt")
}
