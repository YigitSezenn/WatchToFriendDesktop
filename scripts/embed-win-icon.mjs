/**
 * Windows .exe ve kuruluma ikon gömer (signAndEditExecutable kapalıyken).
 */
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const iconIco = join(root, 'build', 'icon.ico')
const iconPng = join(root, 'build', 'icon.png')

const exeCandidates = [
  join(root, 'release', 'win-unpacked', 'WatchToFriend.exe')
]

const exe = exeCandidates.find(existsSync)
if (!exeCandidates.some(existsSync)) {
  console.log('Gomulecek exe bulunamadi, atlandi.')
  process.exit(0)
}

const icon = existsSync(iconIco) ? iconIco : iconPng
if (!existsSync(icon)) {
  console.error('build/icon.ico veya icon.png bulunamadi')
  process.exit(1)
}

const rceditBin = join(
  root,
  'node_modules',
  'rcedit',
  'bin',
  'rcedit-x64.exe'
)

if (!existsSync(rceditBin)) {
  console.error('rcedit bulunamadi. npm install -D rcedit calistirin.')
  process.exit(1)
}

execFileSync(rceditBin, [exe, '--set-icon', icon], { stdio: 'inherit' })
console.log('Exe ikonu guncellendi:', exe)
