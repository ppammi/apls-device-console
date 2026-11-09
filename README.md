# ALPS Device Console – take-home

A slice of the ALPS operator console: searchable, paginated device list, device detail with
action history, and a "Lock device" action with optimistic update and rollback.

The data layer (`src/data/`) is hand-rolled on plain `fetch`, as the brief requires:
request cache with dedupe and a 30s TTL, protection against out-of-order responses inside
the hook, tenant-scoped query/mutation hooks, and targeted cache invalidation.

## Run

    npm install
    npm run dev
    npm test

The GraphQL API is mocked in the browser with MSW (`src/mocks/`, unchanged from the brief).

## Design decisions

See [NOTES.md](./NOTES.md).
