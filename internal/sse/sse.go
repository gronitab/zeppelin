package sse

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
)

// Broker manages SSE client connections and broadcasts events.
type Broker struct {
	mu      sync.RWMutex
	clients map[chan []byte]struct{}
}

// NewBroker creates an SSE broker.
func NewBroker() *Broker {
	return &Broker{
		clients: make(map[chan []byte]struct{}),
	}
}

// ServeHTTP handles SSE client connections at /api/events.
func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	b.ServeHTTPWithInitial(w, r, nil)
}

// ServeHTTPWithInitial handles SSE connections and sends an initial message
// directly to the connecting client before entering the broadcast loop.
func (b *Broker) ServeHTTPWithInitial(w http.ResponseWriter, r *http.Request, initial any) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := make(chan []byte, 64)
	b.addClient(ch)
	defer b.removeClient(ch)

	// Send initial connection event.
	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	flusher.Flush()

	// Send initial snapshot directly to this client.
	if initial != nil {
		data, err := json.Marshal(initial)
		if err == nil {
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

// Broadcast sends data to all connected SSE clients.
func (b *Broker) Broadcast(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("sse: marshal error: %v", err)
		return
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- data:
		default:
			// Client too slow, skip this event.
		}
	}
}

// ClientCount returns the number of connected clients.
func (b *Broker) ClientCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.clients)
}

func (b *Broker) addClient(ch chan []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.clients[ch] = struct{}{}
	log.Printf("sse: client connected (%d total)", len(b.clients))
}

func (b *Broker) removeClient(ch chan []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, ch)
	close(ch)
	log.Printf("sse: client disconnected (%d total)", len(b.clients))
}
