# metrc-mcp

An MCP (Model Context Protocol) server for the [METRC](https://www.metrc.com/) cannabis track-and-trace API, focused on the workflows a processor/manufacturer actually runs day to day: checking active package inventory, resolving tags, reconciling transfer manifests, and pulling lab test results.

I built this after several years running licensed processing operations, where "check METRC" is a dozen-times-a-day interruption. Wrapping the API as MCP tools lets an assistant answer questions like *"which of our active packages are still awaiting lab results?"* or *"reconcile yesterday's incoming manifest against what we received"* directly against the compliance system of record.

## Scope

This deliberately does not wrap the full METRC API. METRC exposes a couple hundred endpoints across cultivation, retail, and processing; most integrations touch a small fraction. This server covers the processor slice:

| Tool | What it does |
| --- | --- |
| `list_facilities` | Facilities visible to your user key, with license numbers |
| `list_active_packages` | Active inventory with testing state and hold status |
| `get_package` | Full record for one package by tag label |
| `finish_package` | Mark a zero-quantity package finished (write, gated) |
| `list_items` | The item catalog packages are created against |
| `list_incoming_transfers` / `list_outgoing_transfers` | Manifests in and out |
| `get_lab_test_results` | Test results for a package by numeric ID |

Cultivation (plants, harvests) and retail (sales receipts) endpoints are out of scope. Adding a domain means one new file in `src/tools/`.

## Safety model

METRC is a legal record. Mistakes in it are compliance findings, not bugs.

- **Read-only by default.** Write tools throw unless `METRC_ALLOW_WRITES=true` is set explicitly.
- **Sandbox support.** Set `METRC_SANDBOX=true` to target your state's sandbox instance. Do not enable writes against a production license until the workflow has been tested there.
- **Bounded output.** List tools cap at 100 rows and say so, rather than flooding the model's context with a busy facility's full inventory.

## METRC auth, briefly

METRC deploys per state (`api-ok.metrc.com`, `api-ca.metrc.com`, ...) and authenticates with HTTP Basic where the **username is the software vendor's API key** and the **password is the user's API key**. The vendor key identifies the integrator; the user key determines which facilities you can see. Both are required. This trips up most first-time integrators, who expect a single bearer token.

Endpoint paths and payload fields can differ slightly between states and API versions. This server targets the v2 endpoints; if your state lags on a particular resource, the 404 error message will say which path failed.

## Setup

```bash
npm install
npm run build
```

Configure via environment (see `.env.example`):

```
METRC_STATE=ok                  # two-letter state code
METRC_VENDOR_API_KEY=...        # from your METRC vendor account
METRC_USER_API_KEY=...          # from your METRC user profile
METRC_LICENSE_NUMBER=...        # optional default license
METRC_SANDBOX=true              # strongly recommended to start
METRC_ALLOW_WRITES=false        # keep false until tested
```

Register with an MCP client (Claude Desktop shown):

```json
{
  "mcpServers": {
    "metrc": {
      "command": "node",
      "args": ["/path/to/metrc-mcp/dist/index.js"],
      "env": {
        "METRC_STATE": "ok",
        "METRC_VENDOR_API_KEY": "...",
        "METRC_USER_API_KEY": "...",
        "METRC_SANDBOX": "true"
      }
    }
  }
}
```

## Testing

```bash
npm test
```

METRC vendor sandbox access requires completing METRC's training and API User Agreement process, so this client is validated against a mocked METRC instance instead (`test/mock-metrc.ts`), with payloads shaped like the real v2 responses. The suite covers two layers:

- **Client tests** — Basic auth construction (vendor key as username, user key as password), query serialization, 429 retry with backoff and eventual surfacing, normalization of METRC's inconsistent error shapes, and license resolution.
- **End-to-end stdio tests** — the compiled server is spawned as a real MCP process and driven over JSON-RPC, the same path Claude Desktop uses. These verify tool registration, response summarization, readable tool-level errors, and that write tools are refused in read-only mode *before any network call is attempted*.

`METRC_BASE_URL` exists solely as the test hook that points the client at the mock.

## Development

```bash
npm run dev        # run from source via tsx
npm run build      # compile to dist/
```

The layering is: `src/metrc/client.ts` owns HTTP, auth, timeouts, and 429 retry; `src/tools/*` define MCP tools per domain and summarize responses; `src/config.ts` validates environment once at startup. Tool handlers never touch `fetch` directly.

## License

MIT
