// A small JSON-schema-like validator. Supports: type (string or list), enum, const, properties, required,
// additionalProperties (false or a schema), items, minItems, maxItems, minLength, maxLength, minimum, maximum,
// pattern, anyOf. Returns a list of problems, each starting with the path of the value, empty when valid.
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

const matchesType = (t, v) => {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return t === actual;
};

export function validate(schema, value, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;
  if (schema.anyOf) {
    if (!schema.anyOf.some((s) => validate(s, value, path).length === 0)) errors.push(`${path}: does not match any allowed shape`);
    return errors;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(t, value))) return [`${path}: expected ${types.join(' or ')}, got ${typeOf(value)}`];
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (typeof value === 'string') {
    const len = [...value].length;
    if (schema.minLength !== undefined && len < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && len > schema.maxLength) errors.push(`${path}: ${len} characters, the most is ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} entries`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: has ${value.length} entries, the most is ${schema.maxItems}`);
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value) || value[k] === undefined) errors.push(`${path}.${k}: is required`);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errors.push(...validate(props[k], v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${k}: is not an allowed field`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, v, `${path}.${k}`));
    }
  }
  return errors;
}
