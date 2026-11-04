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
    await tx.query(`insert into movimientos_bankroll (tipo, importe) values ('deposito', 5000)`)
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
