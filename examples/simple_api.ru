// Rulang Example: Simple API
// A minimal example showing basic API server features

// Simple GET endpoint
endpoint GET "/hello" {
    res.json({ message: "Hello, Rulang!" })
}

// GET with path parameter
endpoint GET "/greet/:name" {
    let name = req.params.name
    res.json({ message: "Hello, " + name + "!" })
}

// POST with body
endpoint POST "/echo" {
    res.json({
        received: req.body,
        method: req.method,
        path: req.path
    })
}

// Query parameters
endpoint GET "/search" {
    let query = req.query.q
    if (query == null) {
        res.status(400).json({ error: "Missing 'q' parameter" })
    } else {
        res.json({
            query: query,
            results: ["result1", "result2", "result3"]
        })
    }
}

// Start server on port 8080
server 8080

print("Simple API running on http://localhost:8080")
print("")
print("Try these endpoints:")
print("  curl http://localhost:8080/hello")
print("  curl http://localhost:8080/greet/World")
print("  curl -X POST -d '{\"foo\":\"bar\"}' http://localhost:8080/echo")
print("  curl 'http://localhost:8080/search?q=test'")
