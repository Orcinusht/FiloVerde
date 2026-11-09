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
const TABLAS = ['casas_apuestas', 'estrategias', 'apuestas', 'selecciones', 'movimientos_bankroll', 'transcripciones']
// El catálogo de deportes y ligas: cada usuario recibe una lista inicial propia al registrarse.
const CATALOGO = ['deportes', 'ligas']

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
    ids.movimiento = (await tx.query(`insert into movimientos_bankroll (tipo, importe, casa_id) values ('deposito', 5000, $1) returning id`, [ids.casa])).rows[0].id
    await tx.query(`insert into storage.objects (bucket_id, name) values ('capturas', $1)`, [`${ANA}/ticket.png`])
    await tx.query(
      `insert into transcripciones (imagen, modelo, resultado, tokens_entrada, tokens_salida, coste_usd)
       values ($1, 'claude-sonnet-5-5', 'ok', 2500, 600, 0.011)`,
      [`${ANA}/ticket.png`],
    )
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
    'apuesta propia enlazando la captura de Ana': [
      `insert into apuestas (importe, imagen_origen) values (100, $1)`,
      [`${ANA}/ticket.png`],
    ],
    'transcripción a nombre de Ana': [
      `insert into transcripciones (user_id, modelo, resultado) values ($1, 'x', 'ok')`,
      [ANA],
    ],
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

// ---------- Fase 1: guardar_apuesta() ----------

const datos = (extra = {}) => JSON.stringify({ importe: 500, tipo: 'combinada', estado: 'pendiente', ...extra })
const sels = JSON.stringify([
  { evento: 'A - B', cuota: 1.5, deporte: 'Fútbol' },
  { evento: 'C - D', cuota: 2, estado: 'ganada', deporte: 'Fútbol' },
])

test('guardar_apuesta crea apuesta + selecciones en orden para quien la llama', async () => {
  await como(BETO, async (tx) => {
    const { rows } = await tx.query(`select public.guardar_apuesta(null, $1::jsonb, $2::jsonb) as id`, [
      datos({ imagen_origen: `${BETO}/b.jpg` }),
      sels,
    ])
    const s = await tx.query(`select evento, orden, estado, user_id from selecciones where apuesta_id = $1 order by orden`, [rows[0].id])
    assert.deepEqual(s.rows.map((r) => [r.evento, r.orden, r.estado]), [['A - B', 0, 'pendiente'], ['C - D', 1, 'ganada']])
    assert.ok(s.rows.every((r) => r.user_id === BETO))
    throw new Error('deshacer') // la transacción se deshace: no deja datos
  }).catch((e) => assert.equal(e.message, 'deshacer'))
})

test('guardar_apuesta: Beto NO puede editar la apuesta de Ana ni usar su casa o su captura', async () => {
  await assert.rejects(
    como(BETO, (tx) => tx.query(`select public.guardar_apuesta($1, $2::jsonb, $3::jsonb)`, [ids.apuesta, datos(), sels])),
    /no encontrada/,
  )
  await assert.rejects(
    como(BETO, (tx) => tx.query(`select public.guardar_apuesta(null, $1::jsonb, $2::jsonb)`, [datos({ casa_id: ids.casa }), sels])),
    'casa de Ana',
  )
  await assert.rejects(
    como(BETO, (tx) =>
      tx.query(`select public.guardar_apuesta(null, $1::jsonb, $2::jsonb)`, [datos({ imagen_origen: `${ANA}/ticket.png` }), sels]),
    ),
    'captura de Ana',
  )
  await como(ANA, async (tx) => {
    const { rows } = await tx.query(`select importe, tipo from apuestas where id = $1`, [ids.apuesta])
    assert.equal(Number(rows[0].importe), 1000, 'la apuesta de Ana sigue igual')
    assert.equal(await cuantas(tx, 'selecciones'), 1)
  })
})

test('guardar_apuesta: un visitante sin sesión no puede usarla', async () => {
  await assert.rejects(
    como(null, (tx) => tx.query(`select public.guardar_apuesta(null, $1::jsonb, $2::jsonb)`, [datos(), sels])),
    /permission denied/,
  )
})

test('guardar_apuesta: si una selección es inválida no se guarda nada', async () => {
  await como(ANA, async (tx) => {
    const antes = await cuantas(tx, 'apuestas')
    await tx.query('savepoint s')
    await assert.rejects(
      tx.query(`select public.guardar_apuesta(null, $1::jsonb, $2::jsonb)`, [datos(), JSON.stringify([{ cuota: 0.5, deporte: 'Fútbol' }])]),
    )
    await tx.query('rollback to savepoint s')
    assert.equal(await cuantas(tx, 'apuestas'), antes)
  })
})

// ---------- Fase 1 (ajustes): varias apuestas por captura, mismo partido, retomar ----------

test('mismo_partido se acepta y guarda selecciones sin cuota con fecha y hora del evento', async () => {
  await como(ANA, async (tx) => {
    await tx.query('savepoint s')
    const { rows } = await tx.query(`select public.guardar_apuesta(null, $1::jsonb, $2::jsonb) as id`, [
      JSON.stringify({ importe: 1000, tipo: 'mismo_partido', cuota_total: 4.5 }),
      JSON.stringify([
        { evento: 'A - B', deporte: 'Fútbol', mercado: 'Resultado', pronostico: 'A', evento_fecha: '2026-11-08', evento_hora: '21:00' },
        { evento: 'A - B', deporte: 'Fútbol', mercado: 'Ambos marcan', pronostico: 'Sí', evento_fecha: '2026-11-08' },
      ]),
    ])
    const s = await tx.query(
      `select cuota, evento_fecha::text f, evento_hora::text h from selecciones where apuesta_id = $1 order by orden`,
      [rows[0].id],
    )
    assert.deepEqual(s.rows.map((r) => [r.cuota, r.f, r.h]), [[null, '2026-11-08', '21:00:00'], [null, '2026-11-08', null]])
    await tx.query('rollback to savepoint s')
  })
})

test('Una selección no puede tener hora del evento sin día', async () => {
  await assert.rejects(
    como(ANA, (tx) => tx.query(`insert into selecciones (apuesta_id, evento_hora) values ($1, '20:00')`, [ids.apuesta])),
    /check/,
  )
})

test('Transcripciones: Beto no puede tocar las de Ana; nadie puede cambiar el coste', async () => {
  let idT
  await como(ANA, async (tx) => {
    idT = (await tx.query(`select id from transcripciones limit 1`)).rows[0].id
    // Ana puede marcar descartadas y soltar la imagen…
    const ok = await tx.query(`update transcripciones set descartadas = '{1}' where id = $1`, [idT])
    assert.equal(ok.affectedRows, 1)
  })
  // …pero no cambiar el coste ni los tokens (aunque sea suya).
  await assert.rejects(
    como(ANA, (tx) => tx.query(`update transcripciones set coste_usd = 0 where id = $1`, [idT])),
    /permission denied/,
  )
  await como(BETO, async (tx) => {
    const r = await tx.query(`update transcripciones set descartadas = '{0}', imagen = null where id = $1`, [idT])
    assert.equal(r.affectedRows, 0, 'Beto no modifica la de Ana')
  })
  await como(ANA, async (tx) => {
    const { rows } = await tx.query(`select descartadas, imagen from transcripciones where id = $1`, [idT])
    assert.deepEqual(rows[0].descartadas, [1])
    assert.equal(rows[0].imagen, `${ANA}/ticket.png`)
  })
})

test('Beto NO puede enlazar su apuesta a una lectura (transcripción) de Ana', async () => {
  const idT = await como(ANA, async (tx) => (await tx.query(`select id from transcripciones limit 1`)).rows[0].id)
  await assert.rejects(
    como(BETO, (tx) =>
      tx.query(`select public.guardar_apuesta(null, $1::jsonb, '[{"evento":"x","deporte":"Tenis"}]'::jsonb)`, [
        JSON.stringify({ importe: 100, transcripcion_id: idT, transcripcion_indice: 0 }),
      ]),
    ),
  )
})

test('La misma apuesta de una lectura no se puede guardar dos veces', async () => {
  await como(ANA, async (tx) => {
    const idT = (await tx.query(`select id from transcripciones limit 1`)).rows[0].id
    const datosT = JSON.stringify({ importe: 100, transcripcion_id: idT, transcripcion_indice: 0 })
    await tx.query('savepoint s')
    await tx.query(`select public.guardar_apuesta(null, $1::jsonb, '[{"evento":"x","deporte":"Tenis"}]'::jsonb)`, [datosT])
    await assert.rejects(tx.query(`select public.guardar_apuesta(null, $1::jsonb, '[{"evento":"x","deporte":"Tenis"}]'::jsonb)`, [datosT]), /unique|duplicate/)
    await tx.query('rollback to savepoint s')
  })
})

// ---------- Fase 1: catálogo de deportes y ligas ----------

test('Cada cuenta nueva recibe su propia lista inicial de deportes y ligas', async () => {
  for (const u of [ANA, BETO]) {
    await como(u, async (tx) => {
      const d = await tx.query(`select nombre from deportes order by nombre`)
      assert.ok(d.rows.length >= 12, 'deportes iniciales')
      assert.ok(d.rows.some((r) => r.nombre === 'Tenis'))
      const tenis = await tx.query(
        `select l.nombre from ligas l join deportes d on d.id = l.deporte_id where d.nombre = 'Tenis' order by 1`,
      )
      assert.deepEqual(tenis.rows.map((r) => r.nombre), ['ATP', 'Challenger', 'Grand Slam', 'ITF', 'WTA'])
    })
  }
})

test('Beto NO ve, cambia ni borra el catálogo de Ana, ni cuelga ligas de sus deportes', async () => {
  let deporteAna, ligaAna
  await como(ANA, async (tx) => {
    deporteAna = (await tx.query(`insert into deportes (nombre) values ('Pádel') returning id`)).rows[0].id
    ligaAna = (await tx.query(`insert into ligas (deporte_id, nombre) values ($1, 'Premier Padel') returning id`, [deporteAna])).rows[0].id
  })
  await como(BETO, async (tx) => {
    for (const t of CATALOGO) {
      const n = (await tx.query(`select count(*)::int n from ${t} where user_id = $1`, [ANA])).rows[0].n
      assert.equal(n, 0, `ve ${t} de Ana`)
    }
    assert.equal((await tx.query(`update deportes set nombre = 'x' where id = $1`, [deporteAna])).affectedRows, 0)
    assert.equal((await tx.query(`delete from ligas where id = $1`, [ligaAna])).affectedRows, 0)
    assert.equal((await tx.query(`delete from deportes where user_id = $1`, [ANA])).affectedRows, 0)
  })
  await assert.rejects(
    como(BETO, (tx) => tx.query(`insert into ligas (deporte_id, nombre) values ($1, 'Intrusa')`, [deporteAna])),
    'liga colgada del deporte de Ana',
  )
  await assert.rejects(
    como(BETO, (tx) => tx.query(`insert into deportes (user_id, nombre) values ($1, 'Intruso')`, [ANA])),
    'deporte a nombre de Ana',
  )
  await como(ANA, async (tx) => {
    const { rows } = await tx.query(`select nombre from deportes where id = $1`, [deporteAna])
    assert.equal(rows[0].nombre, 'Pádel', 'sigue intacto')
  })
  for (const t of CATALOGO) {
    await assert.rejects(como(null, (tx) => tx.query(`select count(*) from ${t}`)), /permission denied/, t)
  }
})

test('Nombres únicos sin mayúsculas ni tildes, y "Mixto" reservado', async () => {
  for (const nombre of ['futbol', 'FÚTBOL', '  Fútbol  ', 'Mixto', 'mixto']) {
    await assert.rejects(como(ANA, (tx) => tx.query(`insert into deportes (nombre) values ($1)`, [nombre])), nombre)
  }
  // Beto puede tener su propio "Pádel": la unicidad es por usuario.
  await como(BETO, async (tx) => {
    await tx.query('savepoint s')
    await tx.query(`insert into deportes (nombre) values ('Padel')`)
    await tx.query('rollback to savepoint s')
  })
})

test('El deporte resumen lo calcula SIEMPRE la base de datos (Tenis, Mixto, al editar y al cambiar de tipo)', async () => {
  await como(ANA, async (tx) => {
    await tx.query('savepoint s')
    const guardar = async (id, tipo, deportes, extra = {}) =>
      (
        await tx.query(`select public.guardar_apuesta($1, $2::jsonb, $3::jsonb) as id`, [
          id,
          JSON.stringify({ importe: 500, tipo, deporte: 'Trampa', ...extra }),
          JSON.stringify(deportes.map((d, i) => ({ evento: `E${i}`, deporte: d }))),
        ])
      ).rows[0].id
    const resumen = async (id) => (await tx.query(`select deporte from apuestas where id = $1`, [id])).rows[0].deporte

    const id = await guardar(null, 'combinada', ['Tenis', 'tenis', 'Tenis'])
    assert.equal(await resumen(id), 'Tenis', 'cinco de tenis = Tenis (y no se fía del navegador)')
    await guardar(id, 'combinada', ['Tenis', 'Fútbol'])
    assert.equal(await resumen(id), 'Mixto', 'al editar: tenis + fútbol = Mixto')
    await guardar(id, 'simple', ['Fútbol'])
    assert.equal(await resumen(id), 'Fútbol', 'al cambiar de tipo a simple')
    await tx.query('savepoint e1')
    await assert.rejects(guardar(null, 'simple', ['']), /deporte/, 'selección sin deporte')
    await tx.query('rollback to savepoint e1')
    await assert.rejects(guardar(null, 'simple', ['Mixto']), /Mixto/, '"Mixto" como deporte de selección')
    await tx.query('rollback to savepoint s')
  })
})

test('Si falla la lista inicial, la cuenta nueva se crea igualmente', async () => {
  await db.query('begin')
  await db.query(`alter table public.deportes rename to deportes_roto`) // simula un fallo
  const nuevo = '00000000-0000-0000-0000-0000000000cc'
  await db.query(`insert into auth.users (id, email) values ($1, 'nuevo@test')`, [nuevo])
  const { rows } = await db.query(`select count(*)::int n from auth.users where id = $1`, [nuevo])
  assert.equal(rows[0].n, 1)
  await db.query('rollback')
})

// ---------- Fase 1: en directo y precipitada ----------

const guardarConducta = (tx, id, extra, estado = 'pendiente') =>
  tx
    .query(`select public.guardar_apuesta($1, $2::jsonb, '[{"evento":"x","deporte":"Fútbol"}]'::jsonb) as id`, [
      id,
      JSON.stringify({ importe: 500, estado, ...extra }),
    ])
    .then((r) => r.rows[0].id)
const conducta = async (tx, id) =>
  (
    await tx.query(
      `select en_directo, viendo_partido, precipitada, recuperar_perdidas, precipitada_momento from apuestas where id = $1`,
      [id],
    )
  ).rows[0]

test('Apuestas existentes: pre-partido y normales, y se siguen editando igual', async () => {
  await como(ANA, async (tx) => {
    const c = await conducta(tx, ids.apuesta)
    assert.deepEqual(c, { en_directo: false, viendo_partido: false, precipitada: false, recuperar_perdidas: false, precipitada_momento: null })
    await tx.query('savepoint s')
    // Edición sin los campos nuevos (como antes): se conserva todo.
    await guardarConducta(tx, ids.apuesta, { importe: 1500 })
    const { rows } = await tx.query(`select importe, precipitada from apuestas where id = $1`, [ids.apuesta])
    assert.equal(Number(rows[0].importe), 1500)
    assert.equal(rows[0].precipitada, false)
    await tx.query('rollback to savepoint s')
  })
})

test('Directo: viendo y no viendo; nunca "veía el partido" sin directo', async () => {
  await como(ANA, async (tx) => {
    await tx.query('savepoint s')
    const a = await guardarConducta(tx, null, { en_directo: true, viendo_partido: true })
    assert.equal((await conducta(tx, a)).viendo_partido, true)
    const b = await guardarConducta(tx, null, { en_directo: true, viendo_partido: false })
    assert.deepEqual([(await conducta(tx, b)).en_directo, (await conducta(tx, b)).viendo_partido], [true, false])
    await tx.query('savepoint e')
    await assert.rejects(guardarConducta(tx, null, { en_directo: false, viendo_partido: true }), /check|viendo/)
    await tx.query('rollback to savepoint e')
    await assert.rejects(tx.query(`update apuestas set en_directo = false where id = $1`, [a]), /viendo/, 'quitar directo sin quitar "veía"')
    await tx.query('rollback to savepoint s')
  })
})

test('Precipitada: el momento lo pone SIEMPRE la base de datos', async () => {
  await como(ANA, async (tx) => {
    await tx.query('savepoint s')
    // Marcada al registrar (pendiente) → al_registrar, aunque el navegador mande otra cosa.
    const a = await guardarConducta(tx, null, { precipitada: true, precipitada_momento: 'al_resolver' })
    assert.equal((await conducta(tx, a)).precipitada_momento, 'al_registrar')
    // Se resuelve después y se guarda sin tocar la casilla → se conserva.
    await guardarConducta(tx, a, { precipitada: true, estado: 'ganada' }, 'ganada')
    assert.equal((await conducta(tx, a)).precipitada_momento, 'al_registrar', 'se conserva al resolver')
    // Se reabre (vuelve a pendiente) → se conserva.
    await guardarConducta(tx, a, { precipitada: true })
    assert.equal((await conducta(tx, a)).precipitada_momento, 'al_registrar', 'se conserva al reabrir')
    // Marcada solo al resolver (ya resuelta) → al_resolver.
    const b = await guardarConducta(tx, null, {}, 'perdida')
    assert.equal((await conducta(tx, b)).precipitada_momento, null)
    await guardarConducta(tx, b, { precipitada: true, recuperar_perdidas: true }, 'perdida')
    assert.equal((await conducta(tx, b)).precipitada_momento, 'al_resolver')
    // Captura que llega resuelta y marcada → al_resolver.
    const c = await guardarConducta(tx, null, { precipitada: true }, 'ganada')
    assert.equal((await conducta(tx, c)).precipitada_momento, 'al_resolver')
    // Desmarcar → se borran la subcasilla y el momento.
    await guardarConducta(tx, b, { precipitada: false, recuperar_perdidas: false }, 'perdida')
    assert.deepEqual(await conducta(tx, b), { en_directo: false, viendo_partido: false, precipitada: false, recuperar_perdidas: false, precipitada_momento: null })
    // Intento directo de poner un momento sin precipitada → se ignora (lo pone la BD).
    await tx.query(`update apuestas set precipitada_momento = 'al_registrar' where id = $1`, [b])
    assert.equal((await conducta(tx, b)).precipitada_momento, null)
    await tx.query('rollback to savepoint s')
  })
})

test('Reglas: "recuperar pérdidas" sin precipitada y momento incoherente se rechazan', async () => {
  await assert.rejects(
    como(ANA, (tx) => guardarConducta(tx, null, { precipitada: false, recuperar_perdidas: true })),
    /recuperar/,
  )
  // Aunque se saltara el disparador, la tabla rechaza un momento sin precipitada.
  await db.query('begin')
  await db.query('alter table public.apuestas disable trigger apuestas_precipitada_momento')
  await assert.rejects(db.query(`update apuestas set precipitada_momento = 'al_registrar' where id = $1`, [ids.apuesta]), /momento/)
  await db.query('rollback')
  await db.query('begin')
  await db.query('alter table public.apuestas disable trigger apuestas_precipitada_momento')
  await assert.rejects(db.query(`update apuestas set precipitada = true where id = $1`, [ids.apuesta]), /momento/)
  await db.query('rollback')
})

test('Beto NO ve ni cambia las casillas de conducta de Ana', async () => {
  await como(BETO, async (tx) => {
    const r = await tx.query(`select en_directo, precipitada from apuestas where id = $1`, [ids.apuesta])
    assert.equal(r.rows.length, 0)
    const u = await tx.query(`update apuestas set precipitada = true, en_directo = true where id = $1`, [ids.apuesta])
    assert.equal(u.affectedRows, 0)
  })
  await como(ANA, async (tx) => assert.equal((await conducta(tx, ids.apuesta)).precipitada, false))
})

// ---------- Fase 1 (retoques): promociones ----------

const promo = async (tx, id) =>
  (
    await tx.query(
      `select promo_tipo, promo_cuota_original::text as cuota_original, promo_aumento::int as aumento, promo_credito::int as credito, promo_base from apuestas where id = $1`,
      [id],
    )
  ).rows[0]
const SIN_PROMO = { promo_tipo: null, cuota_original: null, aumento: null, credito: null, promo_base: null }

test('Promociones: las apuestas existentes quedan sin promoción y la versión anterior de la app las conserva', async () => {
  await como(ANA, async (tx) => {
    assert.deepEqual(await promo(tx, ids.apuesta), SIN_PROMO)
    await tx.query('savepoint s')
    const a = await guardarConducta(tx, null, { promo_tipo: 'aumento', promo_cuota_original: 1.8, promo_aumento: 100, promo_base: 'cuota_original' })
    // Edición como la hace la app publicada en main (sin campos de promoción): se conserva.
    await guardarConducta(tx, a, { importe: 600 })
    assert.deepEqual(await promo(tx, a), { promo_tipo: 'aumento', cuota_original: '1.800000', aumento: 100, credito: null, promo_base: 'cuota_original' })
    // La app nueva siempre envía promo_tipo: vacío = quitar la promoción y vaciar sus datos.
    await guardarConducta(tx, a, { promo_tipo: '' })
    assert.deepEqual(await promo(tx, a), SIN_PROMO)
    // Crear como la app de main: sin promoción.
    const b = await guardarConducta(tx, null, {})
    assert.deepEqual(await promo(tx, b), SIN_PROMO)
    await tx.query('rollback to savepoint s')
  })
})

test('Promociones: cada tipo con sus datos; aumento negativo permitido (la app avisa)', async () => {
  await como(ANA, async (tx) => {
    await tx.query('savepoint s')
    const sup = await guardarConducta(tx, null, { promo_tipo: 'superaumento', promo_aumento: -50, promo_cuota_original: 2.1, promo_base: 'aumento' })
    assert.equal((await promo(tx, sup)).aumento, -50)
    const as = await guardarConducta(tx, null, { promo_tipo: 'asegurada', promo_credito: 500 })
    assert.equal((await promo(tx, as)).credito, 500)
    for (const t of ['credito', 'otra']) {
      const x = await guardarConducta(tx, null, { promo_tipo: t })
      assert.equal((await promo(tx, x)).promo_tipo, t)
    }
    await tx.query('rollback to savepoint s')
  })
})

test('Promociones: la base de datos rechaza combinaciones incoherentes', async () => {
  const malas = {
    'tipo desconocido': { promo_tipo: 'regalo' },
    'datos sin tipo': { promo_aumento: 100 },
    'crédito sin tipo': { promo_credito: 100 },
    'base sin tipo': { promo_base: 'aumento' },
    'cuota original en asegurada': { promo_tipo: 'asegurada', promo_cuota_original: 1.5 },
    'aumento en crédito': { promo_tipo: 'credito', promo_aumento: 100 },
    'crédito si se pierde en aumento': { promo_tipo: 'aumento', promo_credito: 100 },
    'crédito si se pierde en «otra»': { promo_tipo: 'otra', promo_credito: 100 },
    'crédito negativo': { promo_tipo: 'asegurada', promo_credito: -1 },
    'base no válida': { promo_tipo: 'aumento', promo_base: 'inventada' },
    'cuota original < 1': { promo_tipo: 'aumento', promo_cuota_original: 0.5 },
  }
  for (const [nombre, extra] of Object.entries(malas)) {
    await assert.rejects(
      como(ANA, (tx) => guardarConducta(tx, null, extra)),
      /check|violates|promo/i,
      nombre,
    )
  }
  // Y también por fuera de guardar_apuesta (UPDATE directo con la sesión de Ana).
  await assert.rejects(
    como(ANA, (tx) => tx.query(`update apuestas set promo_aumento = 100 where id = $1`, [ids.apuesta])),
    /promo/,
  )
})

test('Beto NO ve ni cambia los datos de promoción de Ana', async () => {
  let id
  await como(ANA, async (tx) => {
    id = await guardarConducta(tx, null, { promo_tipo: 'asegurada', promo_credito: 700 })
  })
  await como(BETO, async (tx) => {
    const r = await tx.query(`select promo_tipo, promo_credito from apuestas where id = $1`, [id])
    assert.equal(r.rows.length, 0)
    const f = await tx.query(`select count(*)::int n from apuestas where promo_tipo is not null`)
    assert.equal(f.rows[0].n, 0, 'el filtro «Con promoción» de Beto no encuentra nada de Ana')
    const u = await tx.query(`update apuestas set promo_credito = 1 where id = $1`, [id])
    assert.equal(u.affectedRows, 0)
    await assert.rejects(tx.query(`select public.guardar_apuesta($1, '{"importe":100,"promo_tipo":""}'::jsonb, '[{"evento":"x","deporte":"Fútbol"}]'::jsonb)`, [id]), /no encontrada/)
  })
  await como(ANA, async (tx) => {
    assert.equal((await promo(tx, id)).credito, 700)
    await tx.query(`delete from apuestas where id = $1`, [id])
  })
})

test('La migración de promociones se puede pegar dos veces sin errores', async () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261105000001_fase1_promociones.sql'), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const { rows } = await db.query(
    `select count(*)::int n from pg_constraint where conrelid = 'public.apuestas'::regclass and conname like 'apuestas_promo%'`,
  )
  assert.equal(rows[0].n, 6)
  await como(ANA, async (tx) => assert.deepEqual(await promo(tx, ids.apuesta), SIN_PROMO))
})

test('Exportar a CSV: Beto, con las consultas de la exportación y el id de Ana, no obtiene nada de ella', async () => {
  // Mismas consultas que src/lib/exportar/leer.ts (filtro por user_id + RLS), con el id de Ana.
  await como(BETO, async (tx) => {
    for (const [tabla, cols] of [
      ['apuestas', 'id, fecha, casa_id, notas, promo_tipo, promo_credito'],
      ['selecciones', 'id, apuesta_id, evento, cuota'],
      ['casas_apuestas', 'id, nombre'],
      ['estrategias', 'id, nombre'],
    ]) {
      const { rows } = await tx.query(`select ${cols} from ${tabla} where user_id = $1 order by id limit 1000 offset 0`, [ANA])
      assert.equal(rows.length, 0, `${tabla}: 0 filas de Ana`)
    }
  })
  // Ana, con las mismas consultas, sí ve lo suyo.
  await como(ANA, async (tx) => {
    const { rows } = await tx.query(`select id from apuestas where user_id = $1 order by fecha, created_at, id limit 1000 offset 0`, [ANA])
    assert.ok(rows.length >= 1)
  })
})

test('Análisis: Beto, con las consultas de la pantalla Análisis y el id de Ana, no obtiene nada de ella', async () => {
  // Mismas consultas que src/lib/analisis/leer.ts (filtro por user_id, estados y fechas + RLS).
  const estados = ['ganada', 'perdida', 'cash_out', 'media_ganada', 'media_perdida', 'pendiente']
  await como(BETO, async (tx) => {
    const a = await tx.query(
      `select id, importe, resultado_economico, promo_tipo from apuestas
        where user_id = $1 and estado = any($2) and fecha >= $3 and fecha < $4
        order by fecha, created_at, id limit 1000 offset 0`,
      [ANA, estados, '2000-01-01', '2100-01-01'],
    )
    assert.equal(a.rows.length, 0, 'apuestas: 0 filas de Ana')
    const s = await tx.query(`select apuesta_id, mercado from selecciones where user_id = $1 and apuesta_id = any($2) order by id limit 1000`, [ANA, [ids.apuesta]])
    assert.equal(s.rows.length, 0, 'selecciones: 0 filas de Ana aunque conozca el id de su apuesta')
  })
  await como(ANA, async (tx) => {
    const a = await tx.query(`select id from apuestas where user_id = $1 and estado = any($2) order by fecha, created_at, id limit 1000`, [ANA, estados])
    assert.ok(a.rows.length >= 1, 'Ana sí ve las suyas')
  })
})

// ---------- Fase 3 · Bankroll: movimientos por casa ----------

test('Bankroll: reglas de la base de datos para los movimientos', async () => {
  await como(ANA, async (tx) => {
    const otra = (await tx.query(`insert into casas_apuestas (nombre) values ('Otra casa de Ana') returning id`)).rows[0].id
    const intenta = async (sql, params) => {
      await tx.query('savepoint s')
      try {
        await tx.query(sql, params)
        await tx.query('release savepoint s')
        return 'ok'
      } catch (e) {
        await tx.query('rollback to savepoint s')
        return e.message
      }
    }
    const ins = (cols, vals, params) => intenta(`insert into movimientos_bankroll (${cols}) values (${vals})`, params)
    assert.equal(await ins('tipo, importe, casa_id, casa_destino_id', `'traspaso', 100, $1, $2`, [ids.casa, otra]), 'ok')
    assert.equal(await ins('tipo, importe, casa_id', `'ajuste', -250, $1`, [ids.casa]), 'ok', 'ajuste negativo')
    assert.equal(await ins('tipo, importe, casa_id, notas', `'retirada', 10, $1, '=SUMA(A1)'`, [ids.casa]), 'ok')
    assert.notEqual(await ins('tipo, importe', `'deposito', 100`, []), 'ok', 'sin casa')
    assert.notEqual(await ins('tipo, importe, casa_id', `'deposito', 0, $1`, [ids.casa]), 'ok', 'importe 0')
    assert.notEqual(await ins('tipo, importe, casa_id', `'retirada', -5, $1`, [ids.casa]), 'ok', 'retirada negativa')
    assert.notEqual(await ins('tipo, importe, casa_id', `'traspaso', -5, $1`, [ids.casa]), 'ok', 'traspaso negativo')
    assert.notEqual(await ins('tipo, importe, casa_id', `'ajuste', 0, $1`, [ids.casa]), 'ok', 'ajuste 0')
    assert.notEqual(await ins('tipo, importe, casa_id', `'regalo', 5, $1`, [ids.casa]), 'ok', 'tipo inválido')
    assert.notEqual(await ins('tipo, importe, casa_id, casa_destino_id', `'traspaso', 5, $1, $1`, [ids.casa]), 'ok', 'traspaso a la misma casa')
    assert.notEqual(await ins('tipo, importe, casa_id', `'traspaso', 5, $1`, [ids.casa]), 'ok', 'traspaso sin destino')
    assert.notEqual(await ins('tipo, importe, casa_id, casa_destino_id', `'deposito', 5, $1, $2`, [ids.casa, otra]), 'ok', 'destino fuera de traspaso')
    assert.notEqual(await ins('tipo, importe, casa_id, notas', `'deposito', 5, $1, repeat('x', 501)`, [ids.casa]), 'ok', 'notas largas')
    // Fecha: nada futuro (margen de un día por la zona horaria); al editar solo si cambia la fecha.
    assert.match(await ins('tipo, importe, casa_id, fecha', `'deposito', 5, $1, now() + interval '2 days'`, [ids.casa]), /no puede ser futura/)
    assert.equal(await ins('tipo, importe, casa_id, fecha', `'deposito', 5, $1, now() + interval '20 hours'`, [ids.casa]), 'ok', 'margen de un día')
    assert.equal(await ins('tipo, importe, casa_id, fecha', `'deposito', 5, $1, '2020-01-01'`, [ids.casa]), 'ok', 'fechas antiguas sí')
    assert.match(await intenta(`update movimientos_bankroll set fecha = now() + interval '3 days' where id = $1`, [ids.movimiento]), /no puede ser futura/)
    assert.equal(await intenta(`update movimientos_bankroll set notas = 'editado' where id = $1`, [ids.movimiento]), 'ok')
    const { rows } = await tx.query(`select updated_at > created_at as cambia from movimientos_bankroll where id = $1`, [ids.movimiento])
    assert.ok(rows[0].cambia !== undefined)
    // No se puede borrar una casa con movimientos.
    assert.match(await intenta(`delete from casas_apuestas where id = $1`, [otra]), /foreign key|violates/)
    await tx.query(`delete from movimientos_bankroll where casa_id = $1 or casa_destino_id = $1`, [otra])
    assert.equal(await intenta(`delete from casas_apuestas where id = $1`, [otra]), 'ok', 'sin movimientos sí se puede')
    await tx.query(`delete from movimientos_bankroll where id <> $1`, [ids.movimiento])
  })
})

test('Bankroll: Beto no ve, cambia ni borra movimientos de Ana, ni usa sus casas', async () => {
  let casaBeto
  await como(BETO, async (tx) => {
    casaBeto = (await tx.query(`insert into casas_apuestas (nombre) values ('Casa de Beto') returning id`)).rows[0].id
    assert.equal((await tx.query(`select * from movimientos_bankroll where user_id = $1`, [ANA])).rows.length, 0)
    assert.equal((await tx.query(`update movimientos_bankroll set importe = 1 where id = $1 returning 1`, [ids.movimiento])).rows.length, 0)
    assert.equal((await tx.query(`delete from movimientos_bankroll where id = $1 returning 1`, [ids.movimiento])).rows.length, 0)
  })
  const falla = async (sql, params) =>
    assert.rejects(como(BETO, (tx) => tx.query(sql, params)), undefined, sql)
  await falla(`insert into movimientos_bankroll (tipo, importe, casa_id) values ('deposito', 100, $1)`, [ids.casa])
  await falla(`insert into movimientos_bankroll (tipo, importe, casa_id, casa_destino_id) values ('traspaso', 100, $1, $2)`, [casaBeto, ids.casa])
  await falla(`insert into movimientos_bankroll (user_id, tipo, importe, casa_id) values ($1, 'deposito', 100, $2)`, [ANA, ids.casa])
  // Ana tampoco puede usar la casa de Beto como destino.
  await assert.rejects(
    como(ANA, (tx) => tx.query(`insert into movimientos_bankroll (tipo, importe, casa_id, casa_destino_id) values ('traspaso', 1, $1, $2)`, [ids.casa, casaBeto])),
  )
  await como(ANA, async (tx) => {
    const { rows } = await tx.query(`select importe from movimientos_bankroll where id = $1`, [ids.movimiento])
    assert.equal(Number(rows[0].importe), 5000, 'el movimiento de Ana sigue igual')
  })
})

test('La migración de bankroll se puede pegar dos veces sin errores', async () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261106000001_fase3_bankroll.sql'), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const { rows } = await db.query(
    `select conname from pg_constraint where conrelid = 'public.movimientos_bankroll'::regclass`,
  )
  const nombres = rows.map((r) => r.conname)
  for (const c of ['tipo_valido', 'importe_valido', 'casa_obligatoria', 'destino_traspaso', 'destino_distinto', 'notas_largo', 'casa_fk', 'casa_destino_fk'])
    assert.ok(nombres.includes(`movimientos_${c}`), c)
  assert.ok(!nombres.includes('movimientos_bankroll_tipo_check') && !nombres.includes('movimientos_bankroll_check'), 'las reglas de la Fase 0 se sustituyen')
  await como(ANA, async (tx) => assert.equal((await tx.query(`select count(*)::int n from movimientos_bankroll`)).rows[0].n, 1))
})

// ---------- Fase 3 · Gestión de casas y estrategias ----------

async function intentaComo(userId, sql, params = []) {
  try {
    await como(userId, (tx) => tx.query(sql, params))
    return 'ok'
  } catch (e) {
    return e.message
  }
}

test('Casas y estrategias: nombre único sin mayúsculas, tildes ni espacios; reservados prohibidos', async () => {
  // Ana ya tiene "Casa de Ana" y "Estrategia de Ana".
  assert.match(await intentaComo(ANA, `insert into casas_apuestas (nombre) values ('  CASA de   ana ')`), /casas_nombre_unico/)
  assert.match(await intentaComo(ANA, `insert into estrategias (nombre) values ('Estrategía de ANA')`), /estrategias_nombre_unico/)
  for (const r of ['Sin casa', 'sin ESTRATEGIA', 'Sin dato', 'Varios', 'Mixto', 'Sín cása']) {
    assert.match(await intentaComo(ANA, `insert into casas_apuestas (nombre) values ($1)`, [r]), /casas_nombre_no_reservado/, r)
    assert.match(await intentaComo(ANA, `insert into estrategias (nombre) values ($1)`, [r]), /estrategias_nombre_no_reservado/, r)
  }
  assert.match(await intentaComo(ANA, `update casas_apuestas set nombre = 'Varios' where id = $1`, [ids.casa]), /no_reservado/, 'tampoco al renombrar')
  // Beto puede usar el mismo nombre que Ana (es por usuario).
  assert.equal(await intentaComo(BETO, `insert into estrategias (nombre) values ('Estrategia de Ana')`), 'ok')
  await como(BETO, (tx) => tx.query(`delete from estrategias where nombre = 'Estrategia de Ana'`))
})

test('Casas y estrategias: no se borran con apuestas (ni casas con movimientos); sin uso, sí', async () => {
  assert.match(await intentaComo(ANA, `delete from casas_apuestas where id = $1`, [ids.casa]), /tiene apuestas/)
  assert.match(await intentaComo(ANA, `delete from estrategias where id = $1`, [ids.estrategia]), /tiene apuestas/)
  await como(ANA, async (tx) => {
    const soloMov = (await tx.query(`insert into casas_apuestas (nombre) values ('Solo movimientos') returning id`)).rows[0].id
    await tx.query(`insert into movimientos_bankroll (tipo, importe, casa_id) values ('deposito', 100, $1)`, [soloMov])
    await tx.query('savepoint s')
    await assert.rejects(tx.query(`delete from casas_apuestas where id = $1`, [soloMov]), /foreign key|violates/)
    await tx.query('rollback to savepoint s')
    await tx.query(`delete from movimientos_bankroll where casa_id = $1`, [soloMov])
    await tx.query(`delete from casas_apuestas where id = $1`, [soloMov])
    const libre = (await tx.query(`insert into estrategias (nombre) values ('Libre') returning id`)).rows[0].id
    assert.equal((await tx.query(`delete from estrategias where id = $1 returning 1`, [libre])).rows.length, 1)
  })
  await como(ANA, async (tx) => {
    const { rows } = await tx.query(`select casa_id, estrategia_id from apuestas where id = $1`, [ids.apuesta])
    assert.deepEqual([rows[0].casa_id, rows[0].estrategia_id], [ids.casa, ids.estrategia], 'la apuesta conserva su casa y su estrategia')
  })
})

test('Casas y estrategias: archivar no cambia nada más; Beto no renombra, archiva ni borra las de Ana', async () => {
  await como(ANA, async (tx) => {
    await tx.query(`update casas_apuestas set archivada = true where id = $1`, [ids.casa])
    const { rows } = await tx.query(`select count(*)::int n from apuestas where casa_id = $1`, [ids.casa])
    assert.ok(rows[0].n >= 1, 'sus apuestas siguen enlazadas')
    await tx.query(`update casas_apuestas set archivada = false where id = $1`, [ids.casa])
  })
  await como(BETO, async (tx) => {
    for (const [sql, p] of [
      [`update casas_apuestas set nombre = 'Hackeada' where id = $1 returning 1`, [ids.casa]],
      [`update casas_apuestas set archivada = true where id = $1 returning 1`, [ids.casa]],
      [`delete from casas_apuestas where id = $1 returning 1`, [ids.casa]],
      [`update estrategias set nombre = 'Hackeada' where id = $1 returning 1`, [ids.estrategia]],
      [`update estrategias set archivada = true where id = $1 returning 1`, [ids.estrategia]],
      [`delete from estrategias where id = $1 returning 1`, [ids.estrategia]],
    ]) assert.equal((await tx.query(sql, p)).rows.length, 0, sql)
  })
  await como(ANA, async (tx) => {
    const { rows } = await tx.query(`select nombre, archivada from casas_apuestas where id = $1`, [ids.casa])
    assert.deepEqual(rows[0], { nombre: 'Casa de Ana', archivada: false })
  })
})

test('Borrar una CUENTA entera con casas, estrategias, apuestas y movimientos sigue funcionando', async () => {
  const CARLA = '00000000-0000-0000-0000-00000000000c'
  await db.query(`insert into auth.users (id, email) values ($1, 'carla@test')`, [CARLA])
  await como(CARLA, async (tx) => {
    const c1 = (await tx.query(`insert into casas_apuestas (nombre) values ('C1') returning id`)).rows[0].id
    const c2 = (await tx.query(`insert into casas_apuestas (nombre) values ('C2') returning id`)).rows[0].id
    const e = (await tx.query(`insert into estrategias (nombre) values ('E') returning id`)).rows[0].id
    const a = (await tx.query(`insert into apuestas (casa_id, estrategia_id, importe) values ($1, $2, 1000) returning id`, [c1, e])).rows[0].id
    await tx.query(`insert into selecciones (apuesta_id, evento) values ($1, 'X')`, [a])
    await tx.query(`insert into movimientos_bankroll (tipo, importe, casa_id, casa_destino_id) values ('traspaso', 100, $1, $2)`, [c1, c2])
    await tx.query(`insert into movimientos_bankroll (tipo, importe, casa_id) values ('deposito', 100, $1)`, [c2])
  })
  await db.query(`delete from auth.users where id = $1`, [CARLA])
  const { rows } = await db.query(
    `select (select count(*) from casas_apuestas where user_id = $1)::int c, (select count(*) from estrategias where user_id = $1)::int e,
            (select count(*) from apuestas where user_id = $1)::int a, (select count(*) from movimientos_bankroll where user_id = $1)::int m`,
    [CARLA],
  )
  assert.deepEqual(rows[0], { c: 0, e: 0, a: 0, m: 0 })
})

test('La migración de casas y estrategias se puede pegar dos veces sin errores', async () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261107000001_fase3_casas_estrategias.sql'), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const { rows } = await db.query(`select count(*)::int n from pg_trigger where tgname in ('casas_sin_apuestas', 'estrategias_sin_apuestas')`)
  assert.equal(rows[0].n, 2)
  await como(ANA, async (tx) => assert.equal((await tx.query(`select count(*)::int n from casas_apuestas where archivada`)).rows[0].n, 0))
})

// ---------- Fase 3 · Deportes y ligas: renombrar en el catálogo y en las apuestas ----------

const apuestaCon = (tx, tipo, sels) =>
  tx
    .query(`select guardar_apuesta(null, $1::jsonb, $2::jsonb) id`, [
      JSON.stringify({ importe: 100, tipo, estado: 'pendiente', cuota_total: 2 }),
      JSON.stringify(sels.map(([deporte, liga]) => ({ deporte, liga, evento: 'X - Y', mercado: 'm', pronostico: 'p', cuota: tipo === 'mismo_partido' ? null : 1.5, estado: 'pendiente' }))),
    ])
    .then((r) => r.rows[0].id)
const idDe = async (tx, sql, p) => (await tx.query(sql, p)).rows[0].id

test('Renombrar un deporte cambia sus selecciones y recalcula el deporte resumen ("Mixto" → un deporte)', async () => {
  await como(ANA, async (tx) => {
    const tenis = await idDe(tx, `select id from deportes where nombre = 'Tenis'`)
    const padel = await idDe(tx, `insert into deportes (nombre) values ('Pádel PRUEBA') returning id`)
    const mixta = await apuestaCon(tx, 'combinada', [['Tenis', null], ['pádel prueba', null]])
    const soloTenis = await apuestaCon(tx, 'simple', [['TENIS', null]])
    assert.equal((await tx.query(`select deporte from apuestas where id = $1`, [mixta])).rows[0].deporte, 'Mixto')
    const prev = (await tx.query(`select * from previsualizar_renombrado('deporte', $1)`, [padel])).rows[0]
    assert.deepEqual(prev, { selecciones: 1, apuestas: 1 })
    // Pádel PRUEBA → "Tenis" no se puede (ya existe: no se mezcla).
    await tx.query('savepoint s')
    await assert.rejects(tx.query(`select * from renombrar_en_catalogo('deporte', $1, 'tenis', 1, 1)`, [padel]), /deportes_nombre_unico/)
    await tx.query('rollback to savepoint s')
    // Renombrar Tenis → "Tenis ATP": su selección de la mixta y la de la simple; la mixta sigue Mixto.
    const r = (await tx.query(`select * from renombrar_en_catalogo('deporte', $1, '  Tenis   ATP ', 2, 2)`, [tenis])).rows[0]
    assert.deepEqual(r, { selecciones: 2, apuestas: 2 }, 'N y M = lo actualizado')
    const sels = (await tx.query(`select apuesta_id, deporte from selecciones where apuesta_id in ($1, $2) order by apuesta_id, orden`, [mixta, soloTenis])).rows
    assert.ok(sels.filter((x) => x.deporte === 'Tenis ATP').length === 2)
    assert.equal((await tx.query(`select deporte from apuestas where id = $1`, [soloTenis])).rows[0].deporte, 'Tenis ATP', 'resumen recalculado')
    // Un deporte escrito distinto en el catálogo y en las apuestas («golf prueba»): al renombrarlo se unifica.
    const otra = await apuestaCon(tx, 'combinada', [['Golf PRUEBA', null], ['golf prueba', null]])
    assert.equal((await tx.query(`select deporte from apuestas where id = $1`, [otra])).rows[0].deporte, 'Golf PRUEBA')
    const golf = await idDe(tx, `insert into deportes (nombre) values ('Golf PRUEBA') returning id`)
    await tx.query(`select * from renombrar_en_catalogo('deporte', $1, 'Golf', 2, 1)`, [golf])
    assert.equal((await tx.query(`select deporte from apuestas where id = $1`, [otra])).rows[0].deporte, 'Golf')
    await tx.query(`delete from apuestas where id = any($1)`, [[mixta, soloTenis, otra]])
    await tx.query(`update deportes set nombre = 'Tenis' where id = $1`, [tenis])
    await tx.query(`delete from deportes where id = any($1)`, [[padel, golf]])
  })
})

test('Renombrar: una apuesta "Mixto" pasa a un solo deporte cuando sus deportes quedan escritos igual', async () => {
  await como(ANA, async (tx) => {
    // Una apuesta guardada como "Mixto" cuyas selecciones acaban siendo del mismo deporte (por ejemplo,
    // tras corregir una a mano): al renombrar ese deporte, el resumen se recalcula y deja de ser "Mixto".
    const f7 = await idDe(tx, `insert into deportes (nombre) values ('Futbol 7 PRUEBA') returning id`)
    const ap = await apuestaCon(tx, 'combinada', [['Fútbol', null], ['Futbol 7 PRUEBA', null]])
    assert.equal((await tx.query(`select deporte from apuestas where id = $1`, [ap])).rows[0].deporte, 'Mixto')
    // Corrección a mano de la selección de Fútbol (sin pasar por guardar_apuesta: el resumen sigue "Mixto").
    await tx.query(`update selecciones set deporte = 'Futbol 7 PRUEBA' where apuesta_id = $1`, [ap])
    await tx.query(`select * from renombrar_en_catalogo('deporte', $1, 'Fútbol 7', 2, 1)`, [f7])
    assert.equal((await tx.query(`select deporte from apuestas where id = $1`, [ap])).rows[0].deporte, 'Fútbol 7', 'Mixto → un solo deporte')
    await tx.query(`delete from apuestas where id = $1`, [ap])
    await tx.query(`delete from deportes where id = $1`, [f7])
  })
})

test('Renombrar una liga no toca la del mismo nombre en otro deporte', async () => {
  await como(ANA, async (tx) => {
    const futbol = await idDe(tx, `select id from deportes where nombre = 'Fútbol'`)
    const volei = await idDe(tx, `select id from deportes where nombre = 'Voleibol'`)
    const lf = await idDe(tx, `insert into ligas (deporte_id, nombre) values ($1, 'Superliga PRUEBA') returning id`, [futbol])
    await tx.query(`insert into ligas (deporte_id, nombre) values ($1, 'Superliga PRUEBA')`, [volei])
    const a1 = await apuestaCon(tx, 'simple', [['Fútbol', 'superliga prueba']])
    const a2 = await apuestaCon(tx, 'simple', [['Voleibol', 'Superliga PRUEBA']])
    assert.deepEqual((await tx.query(`select * from previsualizar_renombrado('liga', $1)`, [lf])).rows[0], { selecciones: 1, apuestas: 1 })
    await tx.query(`select * from renombrar_en_catalogo('liga', $1, 'Superliga Fútbol', 1, 1)`, [lf])
    assert.equal((await tx.query(`select liga from selecciones where apuesta_id = $1`, [a1])).rows[0].liga, 'Superliga Fútbol')
    assert.equal((await tx.query(`select liga from selecciones where apuesta_id = $1`, [a2])).rows[0].liga, 'Superliga PRUEBA', 'la de voleibol no cambia')
    await tx.query(`delete from apuestas where id = any($1)`, [[a1, a2]])
    await tx.query(`delete from ligas where nombre in ('Superliga Fútbol', 'Superliga PRUEBA')`)
  })
})

test('Renombrar es todo o nada: números distintos, nombre repetido o reservado, o un fallo a mitad', async () => {
  await como(ANA, async (tx) => {
    const futbol = await idDe(tx, `select id from deportes where nombre = 'Fútbol'`)
    const l = await idDe(tx, `insert into ligas (deporte_id, nombre) values ($1, 'Liga TON') returning id`, [futbol])
    const a = await apuestaCon(tx, 'simple', [['Fútbol', 'Liga TON']])
    const intenta = async (sql, p) => {
      await tx.query('savepoint s')
      try {
        await tx.query(sql, p)
        await tx.query('release savepoint s')
        return 'ok'
      } catch (e) {
        await tx.query('rollback to savepoint s')
        return e.message
      }
    }
    assert.match(await intenta(`select * from renombrar_en_catalogo('liga', $1, 'Liga X', 2, 1)`, [l]), /han cambiado/)
    assert.match(await intenta(`select * from renombrar_en_catalogo('liga', $1, 'Varios', 1, 1)`, [l]), /ligas_nombre_no_reservado/)
    ids.ligaTon = l
    ids.apuestaTon = a
  })
  // Fallo a MITAD (después de cambiar el catálogo): un disparador de prueba (creado como
  // administrador) rompe al tocar las selecciones. No debe quedar nada cambiado.
  await db.exec(`create function public.romper_prueba() returns trigger language plpgsql as $$ begin raise exception 'fallo simulado'; end $$;
    create trigger romper_prueba before update on public.selecciones for each row execute function public.romper_prueba();`)
  await assert.rejects(
    como(ANA, (tx) => tx.query(`select * from renombrar_en_catalogo('liga', $1, 'Liga Nueva', 1, 1)`, [ids.ligaTon])),
    /fallo simulado/,
  )
  await db.exec(`drop trigger romper_prueba on public.selecciones; drop function public.romper_prueba();`)
  await como(ANA, async (tx) => {
    assert.equal((await tx.query(`select nombre from ligas where id = $1`, [ids.ligaTon])).rows[0].nombre, 'Liga TON', 'el catálogo no cambió')
    assert.equal((await tx.query(`select liga from selecciones where apuesta_id = $1`, [ids.apuestaTon])).rows[0].liga, 'Liga TON', 'las apuestas tampoco')
    await tx.query(`delete from apuestas where id = $1`, [ids.apuestaTon])
    await tx.query(`delete from ligas where id = $1`, [ids.ligaTon])
  })
})

test('Deportes y ligas: reservados, borrar solo sin uso, Beto no toca nada de Ana, visitante sin acceso', async () => {
  let lA, aA
  await como(ANA, async (tx) => {
    const futbol = await idDe(tx, `select id from deportes where nombre = 'Fútbol'`)
    for (const r of ['Sin dato', 'VARIOS', 'mixto']) {
      await tx.query('savepoint s')
      await assert.rejects(tx.query(`insert into deportes (nombre) values ($1)`, [r]), /no_reservado|no_mixto/, r)
      await tx.query('rollback to savepoint s')
    }
    lA = await idDe(tx, `insert into ligas (deporte_id, nombre) values ($1, 'Liga de Ana') returning id`, [futbol])
    aA = await apuestaCon(tx, 'simple', [['Fútbol', 'liga de ana']])
    await tx.query('savepoint s')
    await assert.rejects(tx.query(`delete from ligas where id = $1`, [lA]), /en uso/)
    await tx.query('rollback to savepoint s')
    await tx.query('savepoint s')
    await assert.rejects(tx.query(`delete from deportes where id = $1`, [futbol]), /en uso/)
    await tx.query('rollback to savepoint s')
    const libre = await idDe(tx, `insert into ligas (deporte_id, nombre) values ($1, 'Liga libre') returning id`, [futbol])
    assert.equal((await tx.query(`delete from ligas where id = $1 returning 1`, [libre])).rows.length, 1)
  })
  await como(BETO, async (tx) => {
    for (const sql of [
      `select * from previsualizar_renombrado('liga', $1)`,
      `select * from renombrar_en_catalogo('liga', $1, 'Hack', 1, 1)`,
    ]) {
      await tx.query('savepoint s')
      await assert.rejects(tx.query(sql, [lA]), /no existe/)
      await tx.query('rollback to savepoint s')
    }
    assert.equal((await tx.query(`update ligas set nombre = 'Hack', archivada = true where id = $1 returning 1`, [lA])).rows.length, 0)
    assert.equal((await tx.query(`delete from ligas where id = $1 returning 1`, [lA])).rows.length, 0)
  })
  await assert.rejects(como(null, (tx) => tx.query(`select * from previsualizar_renombrado('liga', $1)`, [lA])), /permission denied/)
  await como(ANA, async (tx) => {
    assert.equal((await tx.query(`select liga from selecciones where apuesta_id = $1`, [aA])).rows[0].liga, 'liga de ana', 'intacta')
    await tx.query(`delete from apuestas where id = $1`, [aA])
    await tx.query(`delete from ligas where id = $1`, [lA])
  })
})

test('Borrar una cuenta entera con deportes y ligas en uso sigue funcionando', async () => {
  const DAVID = '00000000-0000-0000-0000-00000000000d'
  await db.query(`insert into auth.users (id, email) values ($1, 'david@test')`, [DAVID])
  await como(DAVID, async (tx) => {
    const futbol = await idDe(tx, `select id from deportes where nombre = 'Fútbol'`)
    await tx.query(`insert into ligas (deporte_id, nombre) values ($1, 'Liga David')`, [futbol])
    await apuestaCon(tx, 'simple', [['Fútbol', 'Liga David']])
  })
  await db.query(`delete from auth.users where id = $1`, [DAVID])
  const { rows } = await db.query(
    `select (select count(*) from deportes where user_id = $1)::int d, (select count(*) from ligas where user_id = $1)::int l, (select count(*) from selecciones where user_id = $1)::int s`,
    [DAVID],
  )
  assert.deepEqual(rows[0], { d: 0, l: 0, s: 0 })
})

test('La migración de deportes y ligas se puede pegar dos veces sin errores', async () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261108000001_fase3_deportes_ligas.sql'), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const { rows } = await db.query(`select count(*)::int n from pg_trigger where tgname in ('deportes_sin_uso', 'ligas_sin_uso')`)
  assert.equal(rows[0].n, 2)
})

// ---------- Registro, tarea 3: API-Football (caché y equivalencias por usuario) ----------

const API_TABLAS = ['api_futbol_dias', 'api_futbol_equipos', 'api_futbol_ligas', 'api_futbol_uso']

// Ana guarda un día de la caché, una equivalencia de equipo, otra de liga y su uso del día.
async function datosApiDe(tx, sufijo) {
  await tx.query(
    `insert into api_futbol_dias (fecha, partidos) values ('2026-11-09', $1::jsonb)`,
    [JSON.stringify([{ id: 1, fecha: '2026-11-09', hora: '21:00', liga_id: 140, liga: 'La Liga', pais: 'Spain', local_id: 529, local: 'Barcelona', visitante_id: 541, visitante: 'Real Madrid', estado: 'NS' }])],
  )
  await tx.query(`insert into api_futbol_equipos (nombre_captura, equipo_id, equipo_nombre) values ($1, 157, 'Bayern München')`, [`bayern munchen ${sufijo}`])
  const futbol = await idDe(tx, `select id from deportes where nombre = 'Fútbol'`)
  const liga = await idDe(tx, `insert into ligas (deporte_id, nombre) values ($1, $2) returning id`, [futbol, `LaLiga ${sufijo}`])
  await tx.query(`insert into api_futbol_ligas (liga_api_id, liga_api_nombre, pais, liga_id) values (140, 'La Liga', 'Spain', $1)`, [liga])
  await tx.query(`insert into api_futbol_uso (dia, llamadas, restantes, limite_dia) values ('2026-11-09', 3, 7497, 7500)`)
  return liga
}

test('API-Football: cada usuario solo ve, cambia y borra su caché y sus equivalencias', async () => {
  let ligaAna
  await como(ANA, async (tx) => {
    ligaAna = await datosApiDe(tx, 'A')
    for (const t of API_TABLAS) assert.equal(await cuantas(tx, t), 1, t)
  })
  await como(BETO, async (tx) => {
    for (const t of API_TABLAS) {
      assert.equal(await cuantas(tx, t), 0, `Beto ve ${t} de Ana`)
      assert.equal((await tx.query(`update ${t} set user_id = user_id`)).affectedRows, 0, `Beto cambia ${t}`)
      assert.equal((await tx.query(`delete from ${t}`)).affectedRows, 0, `Beto borra ${t}`)
    }
  })
  // Beto no puede escribir a nombre de Ana ni apuntar a una liga de Ana.
  const intentos = [
    [`insert into api_futbol_dias (user_id, fecha) values ($1, '2026-11-10')`, [ANA]],
    [`insert into api_futbol_equipos (user_id, nombre_captura, equipo_id, equipo_nombre) values ($1, 'x', 1, 'X')`, [ANA]],
    [`insert into api_futbol_uso (user_id, dia) values ($1, '2026-11-10')`, [ANA]],
    [`insert into api_futbol_ligas (liga_api_id, liga_api_nombre, liga_id) values (1, 'X', $1)`, [null]],
  ]
  for (const [sql, p] of intentos) {
    const params = p[0] === null ? [ligaAna] : p
    await assert.rejects(como(BETO, (tx) => tx.query(sql, params)), undefined, sql)
  }
  await como(ANA, async (tx) => {
    for (const t of API_TABLAS) assert.equal(await cuantas(tx, t), 1, `${t} de Ana intacta`)
  })
})

test('API-Football: un visitante sin sesión no puede leer ni escribir', async () => {
  for (const t of API_TABLAS) await assert.rejects(como(null, (tx) => tx.query(`select * from ${t}`)), undefined, t)
  await assert.rejects(como(null, (tx) => tx.query(`insert into api_futbol_uso (user_id, dia) values ($1, '2026-11-11')`, [ANA])))
})

test('API-Football: la caché es una lista y los datos raros se rechazan', async () => {
  await assert.rejects(como(ANA, (tx) => tx.query(`insert into api_futbol_dias (fecha, partidos) values ('2026-11-12', '{}'::jsonb)`)))
  await assert.rejects(como(ANA, (tx) => tx.query(`insert into api_futbol_uso (dia, llamadas) values ('2026-11-12', -1)`)))
  await assert.rejects(como(ANA, (tx) => tx.query(`insert into api_futbol_equipos (nombre_captura, equipo_id, equipo_nombre) values ('', 1, 'X')`)))
})

test('API-Football: borrar una liga del catálogo quita su equivalencia; borrar una cuenta entera sigue funcionando', async () => {
  const EVA = '00000000-0000-0000-0000-00000000000e'
  await db.query(`insert into auth.users (id, email) values ($1, 'eva@test')`, [EVA])
  await como(EVA, async (tx) => {
    const liga = await datosApiDe(tx, 'E')
    await tx.query(`delete from ligas where id = $1`, [liga]) // sin uso: se puede borrar
    assert.equal(await cuantas(tx, 'api_futbol_ligas'), 0)
    await datosApiDe(tx, 'E2').catch(() => null) // día y uso repetidos: da igual, solo hace falta tener datos
  })
  await como(EVA, async (tx) => {
    const futbol = await idDe(tx, `select id from deportes where nombre = 'Fútbol'`)
    const liga = await idDe(tx, `insert into ligas (deporte_id, nombre) values ($1, 'Liga Eva') returning id`, [futbol])
    await tx.query(`insert into api_futbol_ligas (liga_api_id, liga_api_nombre, liga_id) values (39, 'Premier League', $1)`, [liga])
    await apuestaCon(tx, 'simple', [['Fútbol', 'Liga Eva']])
  })
  await db.query(`delete from auth.users where id = $1`, [EVA])
  const { rows } = await db.query(
    `select (select count(*) from api_futbol_dias where user_id = $1)::int d, (select count(*) from api_futbol_equipos where user_id = $1)::int e,
            (select count(*) from api_futbol_ligas where user_id = $1)::int l, (select count(*) from api_futbol_uso where user_id = $1)::int u`,
    [EVA],
  )
  assert.deepEqual(rows[0], { d: 0, e: 0, l: 0, u: 0 })
})

test('La migración de API-Football se puede pegar dos veces sin errores', async () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261109000001_registro_api_futbol.sql'), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const { rows } = await db.query(
    `select count(*)::int n from pg_policies where tablename in ('api_futbol_dias', 'api_futbol_equipos', 'api_futbol_ligas', 'api_futbol_uso')`,
  )
  assert.equal(rows[0].n, 16)
  await como(ANA, async (tx) => assert.equal(await cuantas(tx, 'api_futbol_dias'), 1, 'los datos siguen'))
})
