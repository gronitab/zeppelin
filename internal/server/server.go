package server

import (
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/gronitab/zeppelin/internal/sse"
	"github.com/gronitab/zeppelin/internal/state"
)

// Server is the Zeppelin HTTP server.
type Server struct {
	store  *state.Store
	broker *sse.Broker
	mux    *http.ServeMux
}

// New creates a Zeppelin HTTP server.
func New(store *state.Store, broker *sse.Broker, frontendFS fs.FS) *Server {
	s := &Server{
		store:  store,
		broker: broker,
		mux:    http.NewServeMux(),
	}
	s.routes(frontendFS)
	return s
}

func (s *Server) routes(frontendFS fs.FS) {
	// SSE events endpoint.
	s.mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		// Send full snapshot to the connecting client, then stream updates.
		snap := s.store.GetSnapshot()
		s.broker.ServeHTTPWithInitial(w, r, snap)
	})

	// API snapshot endpoint (for one-time fetch).
	s.mux.HandleFunc("/api/snapshot", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		snap := s.store.GetSnapshot()
		data, _ := json.Marshal(snap)
		w.Write(data)
	})

	// Serve frontend static files.
	fileServer := http.FileServer(http.FS(frontendFS))
	s.mux.Handle("/", fileServer)
}

// ServeHTTP implements http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
