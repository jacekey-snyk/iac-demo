import * as path from 'path'
import {exec} from 'child_process'
import {promisify} from 'util'
import {promises as fs} from 'fs'

let execAsync = promisify(exec);

(async () => {
  console.log('collecting changes')

  const {stdout} = await execAsync('git diff --name-only HEAD origin/main')

  let files = stdout.split("\n")

  console.log(`${files.length} has changed`)

  console.log(`starting to parse changed files`)

  Array.from(new Set(files)).filter(file => file.startsWith('manifest')).map(async file => {
    await fs.mkdir(path.join('../', 'test-target', path.dirname(file)), {recursive: true});
    await fs.copyFile(path.join('../', file), path.join('../test-target', file))
  })

  try {
    await execAsync(`snyk iac test ../test-target --json-file-output=output.json`)

  } catch(e) {
    console.error(e)
    throw new Error('snyk test has failed, found security issues')
  }
})().catch(e => {
  console.log(e);
  process.exit(-1)
})