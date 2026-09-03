# Dependency License Obligation Review

Review date: 2026-09-03. Reviewer: **John Fallahee**. Dependency license review:
**CLEARED FOR APPROVED SOURCE-AND-ASSET REPOSITORY DISTRIBUTION**.

This record covers the license classes flagged by the generated SBOM for manual
review. It is an engineering compliance record, not legal advice. John Fallahee
confirmed the source-and-approved-assets repository distribution and accepted the
generated notices on 2026-09-03. No prebuilt standalone bundle or container
containing Sharp/libvips is authorized for distribution.

## LGPL-3.0-or-later: runtime shared libraries

- `@img/sharp-libvips-linux-x64` 1.3.2
- `@img/sharp-libvips-linuxmusl-x64` 1.3.2

These packages are pulled into the runtime graph by Next.js through Sharp. Their
vendor notice identifies libvips and several bundled libraries under LGPLv3 or an
applicable later version. The packages contain shared library objects; LearnLogos
has not modified them.

If a container, archive, or other copy containing these libraries is conveyed,
the release package must preserve the vendor notice, provide the applicable GNU
GPL/LGPL license texts and prominent library notice, and preserve the recipient's
applicable relinking/replacement rights. The exact mechanism must be checked
against [GNU LGPL 3.0 section 4](https://www.gnu.org/licenses/lgpl-3.0.html).

Deployment packaging decision: **APPROVED FOR SOURCE-AND-ASSET REPOSITORY
DISTRIBUTION ONLY**. The repository may provide the required source, approved
contest assets, and instructions and cause recipients to obtain dependencies from
their upstream registry. It may not distribute a prebuilt image, standalone bundle,
or container containing the libraries.

Post-approval standalone inspection (2026-09-03): the generated runtime contains
the Sharp native packages and the `@img/sharp-libvips-*` package directories. This
keeps the binary-distribution decision open; do not distribute the standalone build
or a container derived from it until the required GNU license texts, notices,
source/relinking mechanism, and vendor embedded-library notice are verified for the
exact delivered artifact.

## MPL-2.0: unmodified development and build dependencies

- `axe-core` 4.13.0
- `lightningcss` 1.33.0
- `lightningcss-linux-x64-gnu` 1.33.0
- `lightningcss-linux-x64-musl` 1.33.0

These exact packages are used through ESLint/Vite/Vitest and are not modified by
LearnLogos. MPL 2.0 permits combination in a larger work, while distribution of
MPL-covered executable files requires informing recipients how to obtain the
covered source. Preserve package notices and link to the exact upstream source if
any MPL executable is included in a distributed artifact. See the
[MPL 2.0 license](https://www.mozilla.org/MPL/2.0/) and
[Mozilla's MPL FAQ](https://www.mozilla.org/MPL/2.0/FAQ/).

Post-approval standalone inspection (2026-09-03): **NO MPL DEVELOPMENT PACKAGE
FOUND**. Neither `axe-core` nor a `lightningcss` package is present in the generated
standalone runtime. Repeat this inspection against the final frozen artifact; if an
MPL executable is then present, add its exact source location and license text to
the delivered notices.

## CC-BY-4.0: browser compatibility metadata

- `caniuse-lite` 1.0.30001810

The dependency is unmodified compatibility data used through Next.js/Browserslist.
CC BY 4.0 permits commercial use when appropriate credit, a license link, and any
modification indication are supplied without implying endorsement. Preserve the
package identity, upstream homepage, CC BY 4.0 link, and the statement that the
candidate does not modify the dataset. See the
[CC BY 4.0 deed and legal-code link](https://creativecommons.org/licenses/by/4.0/).

Attribution is present in `THIRD-PARTY-NOTICES.md`; John Fallahee accepted that
attribution on 2026-09-03. The candidate does not modify the dataset.

## Final disposition gates

- [x] John Fallahee confirms the source-and-approved-assets repository distribution model.
- [x] Sharp/libvips binary distribution is prohibited by the approved model; any
      future binary or container distribution reopens the GNU compliance review.
- [x] The inspected standalone runtime contains no MPL development package; any
      future delivered MPL executable reopens the source-location review.
- [x] CC BY attribution is accepted and no dataset modifications were introduced.
- [x] Final generated artifact was rescanned after license and packaging decisions;
      the 448-component SBOM and notices reproduced byte-for-byte, the production
      advisory audit reported no known vulnerabilities, and the standalone package
      inspection confirmed the distribution boundary above.

This dependency review is **CLEARED FOR APPROVED SOURCE-AND-ASSET REPOSITORY
DISTRIBUTION**. It does not clear public release or deployment, and any binary,
standalone bundle, container, dependency change, or artifact change reopens the
applicable review.
