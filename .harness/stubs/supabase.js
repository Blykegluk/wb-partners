// Doublure du client Supabase : enregistre les appels, ne sort jamais sur le réseau.
const result = (data = null) => Promise.resolve({ data, error: null })
const chain = () => {
  const c = {}
  const self = () => c
  for (const m of ['select','eq','neq','order','limit','update','insert','upsert','delete','not','like','in']) c[m] = self
  c.maybeSingle = () => result(null)
  c.single = () => result(null)
  c.then = (res) => result([]).then(res)
  return c
}
export const supabase = {
  from: () => chain(),
  auth: { getSession: () => result({ session: { access_token: 'test' } }) },
}
