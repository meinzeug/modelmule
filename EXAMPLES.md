# EXAMPLES

## CLI

```bash
modelmule init
modelmule serve
modelmule chat "Was ist TypeScript?"
modelmule code "Baue eine Fastify route"
modelmule providers list
modelmule providers add openrouter
modelmule providers add ollama
modelmule providers test
modelmule models list
modelmule usage
modelmule config edit
modelmule route test "Schreibe TypeScript Code"
```

## API

### Health

```bash
curl http://127.0.0.1:43110/health
```

### OpenAI-kompatibles Chat Completion

```bash
curl -s http://127.0.0.1:43110/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "auto",
    "taskType": "coding",
    "messages": [{"role":"user","content":"Schreibe eine TypeScript Funktion"}]
  }'
```
