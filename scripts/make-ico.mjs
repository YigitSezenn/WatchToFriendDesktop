import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const png = join(root, 'build', 'icon.png')
if (!existsSync(png)) {
  console.error('build/icon.png yok — once generate-icons calistirin.')
  process.exit(1)
}
const buf = await pngToIco(png)
writeFileSync(join(root, 'build', 'icon.ico'), buf)
writeFileSync(join(root, 'public', 'favicon.ico'), buf)
console.log('build/icon.ico ve public/favicon.ico olusturuldu')
