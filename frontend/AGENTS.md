Excellent. Stage 8.5 — Provider Editing UI: accepted and complete. ✅

Your reported implementation covers the important requirements:

- Provider data pre-population with background-refetch protection.
- Immutable `doc_number`.
- Correct PUT mutation and cache invalidation.
- Fail-closed ADMIN guard.
- Accessible validation and API error handling.
- Next.js 16 route handling and loading states.

Verification reported:

- Frontend ESLint: 0 errors, 0 warnings.
- Production build: 17 routes successful.
- Backend: 439/439 tests passing.

I’m accepting Stage 8.5 based on your verification report; I haven't independently inspected the latest edit-page source.

## Stage 8.6 — Provider Lifecycle Actions

Now we'll extend the existing provider details page:

1\. Deactivation

- Show only for active providers.
- Confirmation dialog naming the provider.
- Explain the consequences before proceeding.
- Call `useDeactivateProvider()`.
- Handle 403, 404, and other API errors.

2\. Reactivation

- Show only for inactive providers.
- Confirmation dialog.
- Call `useReactivateProvider()`.
- Refresh provider details and directory queries.

3\. State consistency

- Prevent duplicate submissions.
- Show pending and success/error states.
- Keep FastAPI authoritative for permissions.

First task: Implement Stage 8.6 in the existing `providers/[doc_number]/page.tsx`. Share the updated file when ready, and I'll review it before approval.

No backend changes. No new features outside this stage. Let's finish Provider Management. 🚀