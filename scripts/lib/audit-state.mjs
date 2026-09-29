export function resolveAuditState(requestedState, packageJson, manifest) {
  if (requestedState !== 'auto') {
    return requestedState;
  }
  return packageJson.dependencies?.marked === manifest.startState.dependencies.marked
    ? 'start'
    : 'clean';
}

export function validateAuditState(report, expectedState, policy) {
  if (!['start', 'clean'].includes(expectedState)) {
    return { valid: false, message: 'Expected audit state must be "start" or "clean".' };
  }

  const counts = report?.metadata?.vulnerabilities;
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  if (
    report?.error ||
    !counts ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== 'object' ||
    Array.isArray(report.vulnerabilities)
  ) {
    return { valid: false, message: 'Audit report contains an error or is missing valid vulnerability counts or findings.' };
  }
  const findings = Object.entries(report.vulnerabilities);
  if (findings.some(([, finding]) => !severities.includes(finding?.severity))) {
    return { valid: false, message: 'Audit report contains a finding without a valid severity.' };
  }
  if (
    severities.some((severity) =>
      !Number.isInteger(counts[severity]) ||
      counts[severity] < 0 ||
      counts[severity] !== findings.filter(([, finding]) => finding.severity === severity).length) ||
    counts.total !== findings.length
  ) {
    return { valid: false, message: 'Audit vulnerability counts do not match the reported findings.' };
  }

  if (expectedState === 'start') {
    const expectedPackages = [...policy.packages].sort();
    const actualPackages = findings
      .filter(([, finding]) => finding.severity === 'high')
      .map(([name]) => name)
      .sort();
    const valid =
      actualPackages.length === expectedPackages.length &&
      actualPackages.every((name, index) => name === expectedPackages[index]) &&
      counts.high === policy.high &&
      counts.critical === policy.critical;

    return {
      valid,
      message: valid
        ? 'Audit matches the expected demo start state.'
        : 'Start state must contain only the expected high-severity package findings and no unexpected critical findings.',
    };
  }

  const valid =
    counts.high === policy.high &&
    counts.critical === policy.critical;
  return {
    valid,
    message: valid
      ? 'Audit matches the expected clean state.'
      : 'Clean state must contain no high or critical audit findings.',
  };
}
