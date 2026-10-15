# Changelog

## 0.1.0 (2026-10-15)


### Features

* add fixture scrub script ([#76](https://github.com/laszlo462/obd-garage/issues/76)) ([63b01c1](https://github.com/laszlo462/obd-garage/commit/63b01c1dce148e7d195283d15f43c0106861d8e1))
* add skills re-sync script and weekly release watcher ([#16](https://github.com/laszlo462/obd-garage/issues/16)) ([ed774c3](https://github.com/laszlo462/obd-garage/commit/ed774c31e166f86fea534cb5bbf23a6b147824b4))
* **core:** add Channel catalogue, header aliases and unit table ([#77](https://github.com/laszlo462/obd-garage/issues/77)) ([1690468](https://github.com/laszlo462/obd-garage/commit/1690468edb1c2ceeea76d3fefde9b867b808e79d))
* **core:** add Diagnostic Report parser ([#81](https://github.com/laszlo462/obd-garage/issues/81)) ([dedc216](https://github.com/laszlo462/obd-garage/commit/dedc21676862dea1f5df929b8a5ff0161418af55))
* **core:** add Drive Log parser and held-row collapse ([#80](https://github.com/laszlo462/obd-garage/issues/80)) ([4b09529](https://github.com/laszlo462/obd-garage/commit/4b0952926fcc00c5cb76b0e9a51ae8d1f8e7c147))
* **core:** add freeze-frame Look-alikes ([#41](https://github.com/laszlo462/obd-garage/issues/41)) ([#88](https://github.com/laszlo462/obd-garage/issues/88)) ([33cbb44](https://github.com/laszlo462/obd-garage/commit/33cbb449c164ed6e94671a080e52b5faf6270d25))
* **core:** add idle, cruise and regen rules ([#40](https://github.com/laszlo462/obd-garage/issues/40)) ([#86](https://github.com/laszlo462/obd-garage/issues/86)) ([7955713](https://github.com/laszlo462/obd-garage/commit/7955713127bbdbe43c578e036e572d9cceabe4a3))
* **core:** add Rule contract, derive(), Engine start and Peaks rules ([#82](https://github.com/laszlo462/obd-garage/issues/82)) ([30d3c3e](https://github.com/laszlo462/obd-garage/commit/30d3c3e5a3c52eb1b367b79e9dd2b224c8134035))
* make .claude/ self-sufficient for cloud sessions ([#15](https://github.com/laszlo462/obd-garage/issues/15)) ([64368c0](https://github.com/laszlo462/obd-garage/commit/64368c0d013b0adffde30b2ba7c39a73e94e0c73))
* **profiles:** add Generic and 6.7 Vehicle Profiles ([#84](https://github.com/laszlo462/obd-garage/issues/84)) ([6ece0bc](https://github.com/laszlo462/obd-garage/commit/6ece0bc37f36a9a8beb48d93c7f17086564a4ac3))
* **rule-packs:** add 6.7 P0401 Rule Pack ([#43](https://github.com/laszlo462/obd-garage/issues/43)) ([#85](https://github.com/laszlo462/obd-garage/issues/85)) ([4bc394b](https://github.com/laszlo462/obd-garage/commit/4bc394b6eb13761cfb281fa24410ba1870f7d634))
* scaffold app skeleton, dev loop, Docker and CI ([#68](https://github.com/laszlo462/obd-garage/issues/68)) ([8811436](https://github.com/laszlo462/obd-garage/commit/881143626e1a76c607c3db2cf2d5b7d8b596dba7))
* **server:** add app-version re-derive and npm run reparse ([#49](https://github.com/laszlo462/obd-garage/issues/49)) ([#92](https://github.com/laszlo462/obd-garage/issues/92)) ([d9a2922](https://github.com/laszlo462/obd-garage/commit/d9a2922b933ebe713b247e8115aa6f876a19cbc5))
* **server:** add Bundle export ([#50](https://github.com/laszlo462/obd-garage/issues/50)) ([#93](https://github.com/laszlo462/obd-garage/issues/93)) ([5feb53d](https://github.com/laszlo462/obd-garage/commit/5feb53dd4d3f31c3a3185e518fc0e35ca6d760ee))
* **server:** add Notes API ([#48](https://github.com/laszlo462/obd-garage/issues/48)) ([#90](https://github.com/laszlo462/obd-garage/issues/90)) ([f283f03](https://github.com/laszlo462/obd-garage/commit/f283f036e8b3328eef1f2f41399b426588906649))
* **server:** add read API, upload delete and Failed Uploads ([#47](https://github.com/laszlo462/obd-garage/issues/47)) ([#91](https://github.com/laszlo462/obd-garage/issues/91)) ([bb5fd4e](https://github.com/laszlo462/obd-garage/commit/bb5fd4eab9f857ec9aa072c080f5d2c0b3c9e41f))
* **server:** add SQLite storage, migrations and Originals store ([#75](https://github.com/laszlo462/obd-garage/issues/75)) ([72510a6](https://github.com/laszlo462/obd-garage/commit/72510a6fd19c2e3d575ef38423d352842e01983f))
* **server:** add upload endpoint and ingest ([#83](https://github.com/laszlo462/obd-garage/issues/83)) ([1503226](https://github.com/laszlo462/obd-garage/commit/150322673a4c86bd7c43486f90f0ea6aff67a20d))
* **server:** add Vehicles, assignment and Reference Report API ([#46](https://github.com/laszlo462/obd-garage/issues/46)) ([#89](https://github.com/laszlo462/obd-garage/issues/89)) ([96d46fc](https://github.com/laszlo462/obd-garage/commit/96d46fc55a6ee3db98c55ef83fe5eb6a1c3125f2))
* **web:** Channel picker, data table and notices ([#59](https://github.com/laszlo462/obd-garage/issues/59)) ([#129](https://github.com/laszlo462/obd-garage/issues/129)) ([5d6d0df](https://github.com/laszlo462/obd-garage/commit/5d6d0df9f4571c2b083302e29906c42c6d5f10f3))
* **web:** Diagnostic Report viewer and comparison ([#57](https://github.com/laszlo462/obd-garage/issues/57)) ([#118](https://github.com/laszlo462/obd-garage/issues/118)) ([c9bcec9](https://github.com/laszlo462/obd-garage/commit/c9bcec9212f254006732847f6d49de96ed1c86a2))
* **web:** Drive Log Events ([#60](https://github.com/laszlo462/obd-garage/issues/60)) ([#128](https://github.com/laszlo462/obd-garage/issues/128)) ([9cc8399](https://github.com/laszlo462/obd-garage/commit/9cc8399874e3e4e588d16ed7cb94224feb49af49))
* **web:** Drive Log viewer chart and readout ([#58](https://github.com/laszlo462/obd-garage/issues/58)) ([#120](https://github.com/laszlo462/obd-garage/issues/120)) ([d806517](https://github.com/laszlo462/obd-garage/commit/d8065178bb2c7e44532dec5fb7fa78239d3fd06a))
* **web:** error design: load banner, action toast, app-level upload flow ([#110](https://github.com/laszlo462/obd-garage/issues/110)) ([#112](https://github.com/laszlo462/obd-garage/issues/112)) ([e77efb7](https://github.com/laszlo462/obd-garage/commit/e77efb704f0f5f5e50081599f381eabedd19473d))
* **web:** Export sheet ([#66](https://github.com/laszlo462/obd-garage/issues/66)) ([#139](https://github.com/laszlo462/obd-garage/issues/139)) ([5c8c83e](https://github.com/laszlo462/obd-garage/commit/5c8c83ee2f6d5b3f97ea367105b5105e423cbb09))
* **web:** Failed Uploads screen ([#65](https://github.com/laszlo462/obd-garage/issues/65)) ([#109](https://github.com/laszlo462/obd-garage/issues/109)) ([238abbc](https://github.com/laszlo462/obd-garage/commit/238abbcf48a267a33a36da85166c2e999da7881c))
* **web:** Notes ([#62](https://github.com/laszlo462/obd-garage/issues/62)) ([#132](https://github.com/laszlo462/obd-garage/issues/132)) ([58388c4](https://github.com/laszlo462/obd-garage/commit/58388c44b5058728a7ae6a70747968a46c49985c))
* **web:** Recent, Reports and Drive Logs lists ([#55](https://github.com/laszlo462/obd-garage/issues/55)) ([#108](https://github.com/laszlo462/obd-garage/issues/108)) ([e0b7eeb](https://github.com/laszlo462/obd-garage/commit/e0b7eebba9eda7da58fe2cc7b420d95636c18628))
* **web:** Reference Report, freeze-frame lines and Look-alikes ([#61](https://github.com/laszlo462/obd-garage/issues/61)) ([#131](https://github.com/laszlo462/obd-garage/issues/131)) ([5662976](https://github.com/laszlo462/obd-garage/commit/56629762e1f68d089bd02b513be259b45f16e7ac))
* **web:** Report viewer gone codes, status changes and readiness counts ([#144](https://github.com/laszlo462/obd-garage/issues/144)) ([#148](https://github.com/laszlo462/obd-garage/issues/148)) ([23fac90](https://github.com/laszlo462/obd-garage/commit/23fac90a110a85e85efc63545848330c4d889e0a))
* **web:** Report viewer Mode $06 "limits were" and IUMPR ratio decimals ([#145](https://github.com/laszlo462/obd-garage/issues/145)) ([#150](https://github.com/laszlo462/obd-garage/issues/150)) ([1bbb6ea](https://github.com/laszlo462/obd-garage/commit/1bbb6eaaa2a9340fa9a2e70608b0bc609578fbda))
* **web:** Report viewer PID lists: was, filter, EI-AECD timers ([#146](https://github.com/laszlo462/obd-garage/issues/146)) ([#151](https://github.com/laszlo462/obd-garage/issues/151)) ([71d384f](https://github.com/laszlo462/obd-garage/commit/71d384faba8f0b4b78fc5e8175997806255276cb))
* **web:** UI foundation: tokens, shell, sheets, router and Vehicle switcher ([#54](https://github.com/laszlo462/obd-garage/issues/54)) ([#106](https://github.com/laszlo462/obd-garage/issues/106)) ([ca2d63e](https://github.com/laszlo462/obd-garage/commit/ca2d63ee4d9437a40f9b0b2e68826da1fcb42602))
* **web:** Unassigned ([#64](https://github.com/laszlo462/obd-garage/issues/64)) ([#134](https://github.com/laszlo462/obd-garage/issues/134)) ([a968905](https://github.com/laszlo462/obd-garage/commit/a968905386d389e750555caf50d44aeea406d7d2))
* **web:** upload flow behind Add ([#56](https://github.com/laszlo462/obd-garage/issues/56)) ([#111](https://github.com/laszlo462/obd-garage/issues/111)) ([a2572e3](https://github.com/laszlo462/obd-garage/commit/a2572e39512a64acbea75e0bd655afa0f7cc4104))
* **web:** Vehicles and Vehicle settings ([#63](https://github.com/laszlo462/obd-garage/issues/63)) ([#113](https://github.com/laszlo462/obd-garage/issues/113)) ([830b5a7](https://github.com/laszlo462/obd-garage/commit/830b5a7e7befee0eb45fae510a5d406dfd81733c))


### Bug Fixes

* **cloud:** install Node 24 from the npm registry ([#18](https://github.com/laszlo462/obd-garage/issues/18)) ([8031641](https://github.com/laszlo462/obd-garage/commit/8031641b42eaa23352eb4f6bbfd1e14a4f113c15))
* read "Incomplete" monitors as incomplete and drop rebuildDerived ([#98](https://github.com/laszlo462/obd-garage/issues/98)) ([#104](https://github.com/laszlo462/obd-garage/issues/104)) ([7339e08](https://github.com/laszlo462/obd-garage/commit/7339e08950119e1fcd4d8a01cb7273d0fc8d33fa))
* **scripts:** check:slice in agent worktrees, test-only slices and guards ([#124](https://github.com/laszlo462/obd-garage/issues/124)) ([#143](https://github.com/laszlo462/obd-garage/issues/143)) ([1a32edb](https://github.com/laszlo462/obd-garage/commit/1a32edbc6b5321bff34b7195bc8e0c7f71b6745e))
* **server:** apply the Vehicle Profile's hidden Channels in the Drive Log API ([#94](https://github.com/laszlo462/obd-garage/issues/94)) ([#100](https://github.com/laszlo462/obd-garage/issues/100)) ([d230afb](https://github.com/laszlo462/obd-garage/commit/d230afbb545888a810da077f56d1393a4a52dfc5))
* **server:** break a default Reference Report tie by recorded time ([#97](https://github.com/laszlo462/obd-garage/issues/97)) ([#103](https://github.com/laszlo462/obd-garage/issues/103)) ([e8b81fd](https://github.com/laszlo462/obd-garage/commit/e8b81fd4f15d0c4b1745668d5500ba5871d2d318))
* **server:** reject a Failed Upload as the Reference Report ([#95](https://github.com/laszlo462/obd-garage/issues/95)) ([#101](https://github.com/laszlo462/obd-garage/issues/101)) ([e41dd47](https://github.com/laszlo462/obd-garage/commit/e41dd476828fd2d3598c042d00927342a47b08c1))
* **server:** sanitise Bundle entry names and reserve sidecar names ([#96](https://github.com/laszlo462/obd-garage/issues/96)) ([#102](https://github.com/laszlo462/obd-garage/issues/102)) ([15b209c](https://github.com/laszlo462/obd-garage/commit/15b209c6ac779e7b83ac636332874211f80ee567))
* **web:** catalogue load failure shows the load banner ([#115](https://github.com/laszlo462/obd-garage/issues/115)) ([#121](https://github.com/laszlo462/obd-garage/issues/121)) ([b6734c2](https://github.com/laszlo462/obd-garage/commit/b6734c2615fcbeeabe3d85f62ee08fd302faaca6))
* **web:** Fit the misfire table at phone width ([#153](https://github.com/laszlo462/obd-garage/issues/153)) ([4d557b4](https://github.com/laszlo462/obd-garage/commit/4d557b4b92ccdd65ea9196dcbdb62972e3869bca))
* **web:** Keep IUMPR "Completed" off "Conditions met" ([#155](https://github.com/laszlo462/obd-garage/issues/155)) ([#156](https://github.com/laszlo462/obd-garage/issues/156)) ([7d442c1](https://github.com/laszlo462/obd-garage/commit/7d442c1706aff3a3af37f96f02140c38c0c59572))
* **web:** Keep the app on a refused Unassigned export ([#137](https://github.com/laszlo462/obd-garage/issues/137)) ([#140](https://github.com/laszlo462/obd-garage/issues/140)) ([8a815a1](https://github.com/laszlo462/obd-garage/commit/8a815a1aad757d398407f31703f3bca34fd7bdc8))
* **web:** Label the Unassigned log's export row Export… ([#138](https://github.com/laszlo462/obd-garage/issues/138)) ([#141](https://github.com/laszlo462/obd-garage/issues/141)) ([e990f8a](https://github.com/laszlo462/obd-garage/commit/e990f8ae2b5135b0e132e7b1ab78571a202b1c8e))
* **web:** Name the Profile and Rule Packs on the New vehicle sheet ([#127](https://github.com/laszlo462/obd-garage/issues/127)) ([#142](https://github.com/laszlo462/obd-garage/issues/142)) ([9231094](https://github.com/laszlo462/obd-garage/commit/9231094f493f8a9767ded71776f033524aa89ccf))
* **web:** New vehicle sheet comes back after Change ([#119](https://github.com/laszlo462/obd-garage/issues/119)) ([#126](https://github.com/laszlo462/obd-garage/issues/126)) ([38bc7da](https://github.com/laszlo462/obd-garage/commit/38bc7da7c409db1f559601f387d39e92b951366a))
* **web:** Proxy only /api/ routes in the dev server ([#152](https://github.com/laszlo462/obd-garage/issues/152)) ([bd51848](https://github.com/laszlo462/obd-garage/commit/bd51848fb2aff2b1919379f27a24125cd5ef0897))
* **web:** Put Mode $06 "limits were" on its own line ([#145](https://github.com/laszlo462/obd-garage/issues/145)) ([#154](https://github.com/laszlo462/obd-garage/issues/154)) ([af919c4](https://github.com/laszlo462/obd-garage/commit/af919c43ae44f150039f28695201664a69194a6e))


### Performance Improvements

* **server:** stop loading whole derived rows on list, ingest and Notes paths ([#99](https://github.com/laszlo462/obd-garage/issues/99)) ([#105](https://github.com/laszlo462/obd-garage/issues/105)) ([c0bc9db](https://github.com/laszlo462/obd-garage/commit/c0bc9db0b5e57c391bfae4e5b07c3f32416a3edf))


### Documentation

* add deployment guide and examples ([#51](https://github.com/laszlo462/obd-garage/issues/51)) ([ae46620](https://github.com/laszlo462/obd-garage/commit/ae466201629b7645378defa864dd9d20bed03b94))
* add DESIGN.md for the v0.1 UI ([#52](https://github.com/laszlo462/obd-garage/issues/52)) ([8b1fee5](https://github.com/laszlo462/obd-garage/commit/8b1fee505dc3c0b52ee9af3a20211fdd20b4dfde))
* add domain glossary and agent skill setup ([742850c](https://github.com/laszlo462/obd-garage/commit/742850ccfc88fa96907d9b851133fe3f8213d244))
* add Failed Upload and ADRs for owner vs derived data and naive local times ([#25](https://github.com/laszlo462/obd-garage/issues/25)) ([8feb413](https://github.com/laszlo462/obd-garage/commit/8feb4134dcaa706b1f59c321b467b7ee1e3ae654))
* **adr:** accept uPlot after the iPhone prototype; Notes pin to one moment ([0b04e90](https://github.com/laszlo462/obd-garage/commit/0b04e90570f8f49fba9f921fe1baf072f4ac2d96))
* **adr:** record Node 24 native TypeScript and uPlot decisions ([507b1e3](https://github.com/laszlo462/obd-garage/commit/507b1e39439b16d851c99d1f2a30f9e871f2c064))
* **design:** [#116](https://github.com/laszlo462/obd-garage/issues/116) items are v0.1, built in [#144](https://github.com/laszlo462/obd-garage/issues/144)–[#146](https://github.com/laszlo462/obd-garage/issues/146) ([#147](https://github.com/laszlo462/obd-garage/issues/147)) ([3517c29](https://github.com/laszlo462/obd-garage/commit/3517c293d1c190af793ea9ca29f535af4b5fb1f3))
* **design:** Report viewer ports decided in [#116](https://github.com/laszlo462/obd-garage/issues/116) ([#135](https://github.com/laszlo462/obd-garage/issues/135)) ([1e9174d](https://github.com/laszlo462/obd-garage/commit/1e9174da3cf0ea4dd7328ab503f5275bddfbbc83))
* **glossary:** add Rule and Look-alike, widen Vehicle Profile ([#28](https://github.com/laszlo462/obd-garage/issues/28)) ([014f49e](https://github.com/laszlo462/obd-garage/commit/014f49ed51fb445b4030f801fe6b035e14b497bf))
* **glossary:** Vehicles come only from Diagnostic Reports ([#20](https://github.com/laszlo462/obd-garage/issues/20)) ([d4616fc](https://github.com/laszlo462/obd-garage/commit/d4616fcb1e72076e3eb11f3a493e2c8561fb30d5))
* **glossary:** widen Bundle to the Unassigned scope and add Export ([#23](https://github.com/laszlo462/obd-garage/issues/23)) ([0659c0e](https://github.com/laszlo462/obd-garage/commit/0659c0e239b6e20565b94b651ea20bd9ba741f86))
* list a PR's known gaps and offer follow-up comments ([#107](https://github.com/laszlo462/obd-garage/issues/107)) ([bf837da](https://github.com/laszlo462/obd-garage/commit/bf837dac0cf5cbd1b33d7f9195256f2dbcd6d7d5))
* note npm ci --ignore-scripts for Windows without build tools ([#79](https://github.com/laszlo462/obd-garage/issues/79)) ([4b050ae](https://github.com/laszlo462/obd-garage/commit/4b050ae52828bafd522c60c6fb404f210ce2e6cf))
* **readme:** Rule Packs ship Events, not Notes ([#24](https://github.com/laszlo462/obd-garage/issues/24)) ([9220816](https://github.com/laszlo462/obd-garage/commit/92208164b39251ba17b5461567c5416a788b4507))
