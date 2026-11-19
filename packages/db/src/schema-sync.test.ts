import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as shared from '@awt/shared';

const schema = readFileSync(fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)), 'utf8');

function prismaEnum(name: string): string[] {
  const m = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!m) throw new Error(`enum ${name} not found in schema.prisma`);
  return m[1]!
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
}

const pairs: Array<[string, readonly string[]]> = [
  ['UserRole', shared.UserRole],
  ['EnvironmentType', shared.EnvironmentType],
  ['RunStatus', shared.RunStatus],
  ['JobStatus', shared.JobStatus],
  ['DeviceClass', shared.DeviceClass],
  ['TestModule', shared.TestModule],
  ['TestStatus', shared.TestStatus],
  ['Severity', shared.Severity],
  ['FindingClassification', shared.FindingClassification],
  ['IssueStatus', shared.IssueStatus],
  ['ElementRisk', shared.ElementRisk],
  ['ApprovalStatus', shared.ApprovalStatus],
  ['ArtifactType', shared.ArtifactType],
  ['DiscoverySource', shared.DiscoverySource],
];

describe('Prisma enums match @awt/shared', () => {
  it.each(pairs)('%s', (name, values) => {
    expect(prismaEnum(name)).toEqual([...values]);
  });
});
