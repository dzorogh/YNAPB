<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## UI feedback

- User-facing status and error messages in client UI use `sonner` toasts (`toast.success`, `toast.error`), not inline alert text for operational failures.
- Destructive `Alert` blocks may summarize state, but details belong in the toast description.
