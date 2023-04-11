import {Octokit} from '@octokit/rest'

interface SnykFinding {
  targetFile: string,
  projectName: string,
  path: string,
  targetFilePath: string,
  infrastructureAsCodeIssues: [{
    id: string,
    title: string,
    type: string,
    subType: string,
    iacDescription: {
      issue: string,
      impact: string,
      resolve: string
    },
    lineNumber: number,
    path: string[]
  }]
}

interface ChecksCreateParamsOutputAnnotations {
  path: string;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
  title?: string;
  raw_details?: string;
};

let findings = require('./output.json') as SnykFinding[]

(async () => {
  console.log("Parsing snyk output file")

  let octokit = new Octokit({
    auth: process.env["GITHUB_TOKEN"]
  });

  if (!Array.isArray(findings)) {
    console.log("Only one file has failures")
    let temp = findings as SnykFinding;
    findings = [temp]
  }

  let annotations = await Promise.all(findings.filter(finding => finding.infrastructureAsCodeIssues.length > 0)
    .map(async finding => {
      console.log(`handling file ${finding.targetFilePath}`)

      return finding.infrastructureAsCodeIssues.map<ChecksCreateParamsOutputAnnotations>(issue => {
        let actualPath = finding.targetFilePath.split('test-target/')[1];
        return {
          path: actualPath,
          start_line: issue.lineNumber,
          end_line: issue.lineNumber + 1,
          annotation_level: "warning",
          title: issue.title,
          message: `${issue.iacDescription.issue}\nImpact: ${issue.iacDescription.impact}\nResolution: ${issue.iacDescription.resolve}`
        }
      })

  }))

  let flatten = annotations.flatMap(x => x)

  let numberOfBulks = Math.floor(flatten.length / 50) + 1;

  console.log(flatten)

  const [owner, repo] = process.env['GITHUB_REPOSITORY'].split('/')
/*
  let check = await octokit.checks.create({
    repo,
    owner,
    name: "Snyk IAC",
    head_sha: process.env["GITHUB_SHA"],
    
    output: {
      title: "Snyk IAC Findings",
      summary: "Found issues with your PR",
      annotations: flatten.splice(0, 50)
    }
  })
  */

  // inspiration: https://github.com/tangro/tangro-github-toolkit/blob/master/src/checks.ts#L5

  let jobName = "snyk_iac"

 const checkRunsResponse = await octokit.checks.listForRef({
    repo,
    owner,
    name: jobName,
    ref: process.env["GITHUB_REF"],
    status: 'in_progress'
  })
  let checkRun; 
  if (checkRunsResponse.data.check_runs.length === 0) {
    throw new Error(`Could not find check run for action: ${name}`);
  } else {
    checkRun = checkRunsResponse.data.check_runs.find(run =>
      run.name.includes(jobName)
    );
    if (!checkRun) {
      console.log(JSON.stringify(checkRunsResponse.data, null, 2));
      throw new Error(`Could not find check run in: runs`);
    } 
  }

  for (let i = 0 ; i < numberOfBulks ; i++) {
    await octokit.checks.update({
      repo,
      owner,
      name: jobName,
      output: {
        title: "Snyk IAC Findings",
        summary: "Found issues with your PR",
        annotations: flatten.splice(0, 50)
      },
      check_run_id: checkRun.id
    })
  }

})().catch(e => {
  console.error(e)
  process.exit(-1)
})