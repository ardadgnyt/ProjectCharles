# Licensing for v0.9.2 Beta

Project Charles source code is GPL-3.0-or-later. The root LICENSE contains the unmodified GNU GPL v3 text, and package.json declares the SPDX identifier so repository hosting can detect the license.

Quick Share protocol handling was adapted from MultiDrop, including a JavaScript translation of its protocol flow. This is treated as an adaptation, not merely visual inspiration. THIRD-PARTY-NOTICES.md identifies the source, reference revision and modifications. Upstream third-party notices are retained in licenses/multidrop-NOTICES.md.

The previous character-engine attribution was removed based on the maintainer's statement that the earlier engine had been completely replaced. This statement has not been independently established through a full historical source-comparison audit. Other dependency license notices remain intact.

The update package (`npm run release:pack`) includes src/, app/, test/, the build scripts, package-lock.json and the code license. Since v1.0.0 the installer (`CharlesSetup.exe`, built by scripts/package.py) leaves out src/, test/ and scripts/ and carries app/, the built dist/, package-lock.json and the code license. Follow DEVELOPMENT.md to build.

The complete corresponding source of every published version is in the public repository https://github.com/ardadgnyt/ProjectCharles, under the release of the same version. That is where a copy installed with `CharlesSetup.exe` gets its source from; the update package of the same version carries it as well. When publishing, push the exact source the binaries were built from together with the release. No remote publication is performed by packaging.

The named artwork and branding have separate terms in LICENSE-ASSETS.md. Those terms do not restrict the GPL rights in the source code. Dependency licenses are listed in THIRD-PARTY-NOTICES.md.
