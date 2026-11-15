<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Application architecture
- Use TanStack file routes with shared public and role-specific React shells; preserve the framework routing and SSR bootstrap.
- Real identity lives in Cloud: parent accounts (email/password), families, child profiles, PIN sessions; roles only in family_members, written only through security-definer SQL called from server functions.
- Child sessions use a random token in an HttpOnly SameSite=Strict cookie with only its SHA-256 hash stored; child identity always comes from the validated cookie, never a submitted ID, so a background parent session cannot grant child access.
- A device-level child-mode cookie blocks parent server functions until the parent re-enters their password, so a child on a shared device cannot reach parent controls.
- Wellbeing features (screen time, moods, lessons, routines) stay sample data: in-memory per signed-in identity and wiped on identity change; only public pages use the browser-local demo archive, so private reflections are never written to the browser.
- Parent summaries must use an explicit non-journal data projection so private child reflections never enter parent views or exports.
