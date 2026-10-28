// Prueba de seguridad: un usuario NO puede leer ni tocar los datos de otro.
//
// Arranca un Postgres de pruebas en memoria (PGlite, sin Docker ni internet),
// aplica las migraciones reales de supabase/migrations y simula a dos personas,
// Ana y Beto, igual que lo hace Supabase cuando alguien entra con su sesión.
//
// Ejecutar:  npm test

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const ROOT = join(import.meta.dirname, '..')
const ANA = '00000000-0000-0000-0000-00000000000a'
const BETO = '00000000-0000-0000-0000-00000000000b'
const TABLAS = ['casas_apuestas', 'estrategias', 'apuestas', 'selecciones', 'movimientos_bankroll']

let db
const ids = {}

// Ejecuta `fn` como si fuese el usuario indicado (null = visitante sin sesión).
async function como(userId, fn) {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.query(`set local role authenticated`)
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ])
    } else {
      await tx.query(`set local role anon`)
    }
    return fn(tx)
  })
}

const cuantas = async (tx, tabla) =>
  (await tx.query(`select count(*)::int as n from ${tabla}`)).rows[0].n

before(async () => {
  db = new PGlite()
  await db.exec(readFileSync(join(ROOT, 'tests/supabase-stub.sql'), 'utf8'))
  const dir = join(ROOT, 'supabase/migrations')
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'))
  }
  // Se registran Ana y Beto (lo haría Supabase Auth).
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@test'), ($2, 'beto@test')`, [ANA, BETO])

  // Ana crea un dato en cada tabla y sube una captura.
  await como(ANA, async (tx) => {
    ids.casa = (await tx.query(`insert into casas_apuestas (nombre) values ('Casa de Ana') returning id`)).rows[0].id
    ids.estrategia = (await tx.query(`insert into estrategias (nombre) values ('Estrategia de Ana') returning id`)).rows[0].id
    ids.apuesta = (
      await tx.query(
        `insert into apuestas (casa_id, estrategia_id, importe, cuota_total) values ($1, $2, 1000, 1.85) returning id`,
        [ids.casa, ids.estrategia],
      )
    ).rows[0].id
    await tx.query(`insert into selecciones (apuesta_id, evento, cuota) values ($1, 'Betis - Sevilla', 1.85)`, [ids.apuesta])
    await tx.query(`insert into movimientos_bankroll (tipo, importe) values ('deposito', 5000)`)
    await tx.query(`insert into storage.objects (bucket_id, name) values ('capturas', $1)`, [`${ANA}/ticket.png`])
  })
})

test('Ana ve sus propios datos (1 fila en cada tabla y su perfil)', async () => {
  await como(ANA, async (tx) => {
    for (const t of [...TABLAS, 'perfiles']) assert.equal(await cuantas(tx, t), 1, t)
    assert.equal(await cuantas(tx, 'storage.objects'), 1, 'captura')
    const { rows } = await tx.query(`select divisa from apuestas`)
    assert.equal(rows[0].divisa, 'EUR', 'la divisa sale del perfil')
  })
})

test('Beto NO ve nada de Ana (0 filas en todas las tablas, su perfil solo)', async () => {
  await como(BETO, async (tx) => {
    for (const t of TABLAS) assert.equal(await cuantas(tx, t), 0, t)
    const perfiles = await tx.query(`select user_id from perfiles`)
    assert.deepEqual(perfiles.rows.map((r) => r.user_id), [BETO])
    assert.equal(await cuantas(tx, 'storage.objects'), 0, 'capturas de Ana')
  })
})

test('Beto NO puede modificar ni borrar los datos de Ana', async () => {
  await como(BETO, async (tx) => {
    for (const t of TABLAS) {
      const del = await tx.query(`delete from ${t}`)
      assert.equal(del.affectedRows, 0, `borrar en ${t}`)
    }
    const upd = await tx.query(`update apuestas set importe = 1 where id = $1`, [ids.apuesta])
    assert.equal(upd.affectedRows, 0)
    const updPerfil = await tx.query(`update perfiles set divisa = 'USD' where user_id = $1`, [ANA])
    assert.equal(updPerfil.affectedRows, 0)
    const delCaptura = await tx.query(`delete from storage.objects`)
    assert.equal(delCaptura.affectedRows, 0, 'borrar captura de Ana')
  })
  // Comprobamos desde Ana que todo sigue intacto.
  await como(ANA, async (tx) => {
    for (const t of TABLAS) assert.equal(await cuantas(tx, t), 1, t)
    const { rows } = await tx.query(`select importe from apuestas`)
    assert.equal(Number(rows[0].importe), 1000)
  })
})

test('Beto NO puede crear datos a nombre de Ana ni colgarse de los suyos', async () => {
  const intentos = {
    'apuesta a nombre de Ana': [`insert into apuestas (user_id, importe) values ($1, 100)`, [ANA]],
    'selección en la apuesta de Ana': [`insert into selecciones (apuesta_id) values ($1)`, [ids.apuesta]],
    'selección con user_id de Ana': [`insert into selecciones (apuesta_id, user_id) values ($1, $2)`, [ids.apuesta, ANA]],
    'apuesta propia usando la casa de Ana': [`insert into apuestas (casa_id, importe) values ($1, 100)`, [ids.casa]],
    'captura en la carpeta de Ana': [`insert into storage.objects (bucket_id, name) values ('capturas', $1)`, [`${ANA}/x.png`]],
  }
  for (const [nombre, [sql, params]] of Object.entries(intentos)) {
    await assert.rejects(como(BETO, (tx) => tx.query(sql, params)), nombre)
  }
})

test('Un visitante sin sesión no puede leer ninguna tabla', async () => {
  for (const t of [...TABLAS, 'perfiles']) {
    await assert.rejects(como(null, (tx) => cuantas(tx, t)), /permission denied/, t)
  }
  await como(null, async (tx) => assert.equal(await cuantas(tx, 'storage.objects'), 0))
})

test('Una selección no puede tener un user_id distinto al de su apuesta (ni siquiera como admin)', async () => {
  await assert.rejects(
    db.query(`insert into selecciones (apuesta_id, user_id) values ($1, $2)`, [ids.apuesta, BETO]),
    /foreign key/,
  )
})

test('El bucket de capturas es privado', async () => {
  const { rows } = await db.query(`select public from storage.buckets where id = 'capturas'`)
  assert.equal(rows[0].public, false)
})
