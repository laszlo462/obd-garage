// Re-sync the vendored skills in .claude/skills/ from a mattpocock/skills release.
//
//   node scripts/sync-skills.ts <tag>      e.g. node scripts/sync-skills.ts v1.3.1
//
// Reads the skill list from .claude/skills/THIRD-PARTY.md, replaces each listed folder with
// upstream's copy at <tag>, re-applies the project edits (see THIRD-PARTY.md) and updates the
// version and licence there. Leaves a working-tree diff to review; never commits.
// Set GITHUB_TOKEN or GH_TOKEN to lift the API rate limit.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const UPSTREAM = "mattpocock/skills";
// Upstream folders that hold released skills (not deprecated/ or in-progress/).
const CATEGORIES = ["engineering", "productivity", "misc"];
const SKILLS_DIR = join(import.meta.dirname, "..", ".claude", "skills");
const NOTICE = join(SKILLS_DIR, "THIRD-PARTY.md");
// The vendored version, also read by .github/workflows/skills-release.yml.
const VERSION = /(\*\*mattpocock\/skills )([\w.-]+)(\*\*)/;

type Skill = { local: string; upstream: string };

// Throws rather than calling process.exit(): exiting with fetches in flight crashes Node on Windows.
function fail(message: string): never {
	throw new Error(message);
}

// The ```skills block: one skill per line, `local = upstream` where the name differs.
function parseSkills(notice: string): Skill[] {
	const block = notice.match(/```skills\r?\n([\s\S]*?)```/);
	if (!block) fail("no ```skills block in THIRD-PARTY.md");
	return block[1]
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [local, upstream = local] = line.split("=").map((s) => s.trim());
			return { local, upstream };
		});
}

async function get(url: string): Promise<Response> {
	const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
	const headers: Record<string, string> = { "User-Agent": "sync-skills" };
	if (token && url.startsWith("https://api.github.com/")) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(url, { headers });
	if (!res.ok) fail(`${res.status} ${res.statusText} for ${url}`);
	return res;
}

async function getText(tag: string, path: string): Promise<string> {
	const res = await get(`https://raw.githubusercontent.com/${UPSTREAM}/${tag}/${path}`);
	return res.text();
}

// Upstream skills that call the review skill by name would hit Claude Code's built-in
// /code-review, so every mention becomes the vendored name.
function applyProjectEdits(text: string, renames: Skill[]): string {
	let out = text;
	for (const { local, upstream } of renames) {
		out = out.replace(new RegExp(`\\b${upstream}\\b`, "g"), local);
	}
	return out;
}

async function main(): Promise<void> {
	const tag = process.argv[2];
	if (!tag) fail("usage: node scripts/sync-skills.ts <tag>   (e.g. v1.3.1)");

	const notice = await readFile(NOTICE, "utf8");
	if (!VERSION.test(notice)) fail("no **mattpocock/skills <version>** in THIRD-PARTY.md");
	const skills = parseSkills(notice);
	const renames = skills.filter((s) => s.local !== s.upstream);

	const treeRes = await get(`https://api.github.com/repos/${UPSTREAM}/git/trees/${tag}?recursive=1`);
	const tree = (await treeRes.json()) as { truncated: boolean; tree: { path: string; type: string }[] };
	if (tree.truncated) fail("upstream tree listing was truncated");
	const blobs = tree.tree.filter((e) => e.type === "blob").map((e) => e.path);

	// Resolve every skill before touching the working tree, so a missing one changes nothing.
	const plan = skills.map((skill) => {
		const roots = CATEGORIES.map((c) => `skills/${c}/${skill.upstream}/`).filter((root) =>
			blobs.includes(`${root}SKILL.md`),
		);
		return { skill, roots };
	});
	const missing = plan.filter((p) => p.roots.length === 0).map((p) => p.skill.upstream);
	if (missing.length) fail(`not in ${UPSTREAM} ${tag}: ${missing.join(", ")}`);
	const ambiguous = plan.filter((p) => p.roots.length > 1).map((p) => p.skill.upstream);
	if (ambiguous.length) fail(`in more than one category at ${tag}: ${ambiguous.join(", ")}`);

	const files = await Promise.all(
		plan.flatMap(({ skill, roots: [root] }) =>
			blobs
				.filter((path) => path.startsWith(root))
				.map(async (path) => ({
					dest: join(SKILLS_DIR, skill.local, path.slice(root.length)),
					text: applyProjectEdits(await getText(tag, path), renames),
				})),
		),
	);
	const licence = (await getText(tag, "LICENSE")).trim();

	for (const { skill } of plan) await rm(join(SKILLS_DIR, skill.local), { recursive: true, force: true });
	for (const { dest, text } of files) {
		await mkdir(dirname(dest), { recursive: true });
		await writeFile(dest, text);
	}

	const eol = notice.includes("\r\n") ? "\r\n" : "\n";
	const updated = notice
		.replace(VERSION, `$1${tag}$3`)
		.replace(/(## Licence\r?\n\r?\n```\r?\n)[\s\S]*?(\r?\n```)/, (_, open, close) => {
			return open + licence.replace(/\r?\n/g, eol) + close;
		});
	await writeFile(NOTICE, updated);

	console.log(`Synced ${skills.length} skills from ${UPSTREAM} ${tag}. Review with: git diff -- .claude/skills`);
}

try {
	await main();
} catch (error) {
	console.error(`sync-skills: ${error instanceof Error ? error.message : error}`);
	process.exitCode = 1;
}
