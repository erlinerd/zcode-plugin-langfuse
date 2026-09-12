# Pull request

## Summary

<!-- What changed and why? Keep this focused. -->

## Validation

- [ ] `npm run check`
- [ ] `npm run package:plugin`
- [ ] `artifacts/plugin.zip` checksum verifies; generated `dist/` and `artifacts/` remain ignored.
- [ ] Plugin and marketplace versions remain synchronized.
- [ ] No credentials, prompts, transcripts, or private Hook payloads are included.

## Privacy and compatibility

- [ ] Capture behavior is documented and covered by tests where relevant.
- [ ] Fail-open behavior is preserved.
- [ ] Unsupported ZCode Hook events or runtime assumptions were not introduced.

## Notes for reviewers

<!-- Mention migration, release, or manual ZCode verification steps. -->
