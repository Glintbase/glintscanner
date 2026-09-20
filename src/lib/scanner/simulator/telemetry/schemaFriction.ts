/**
 * Schema Friction Index Calculator for Glintbase Flight Simulator.
 * Analyzes tool schemas and API definitions for ambiguities, missing required fields,
 * and type mismatch risks that cause autonomous LLM agents to stall or hallucinate.
 * Friction Score is normalized 0 (flawless) to 100 (hostile).
 */

export interface SchemaFrictionResult {
  score: number; // 0 - 100
  rating: 'Flawless' | 'Low Friction' | 'Medium Friction' | 'High Friction' | 'Hostile';
  issues: string[];
  bottlenecks: string[];
  analyzedPropertiesCount: number;
}

/**
 * Evaluate JSON Schema / Zod schema friction.
 */
export function evaluateSchemaFriction(schema: any): SchemaFrictionResult {
  if (!schema || typeof schema !== 'object') {
    return {
      score: 50,
      rating: 'Medium Friction',
      issues: ['Schema is missing or not a valid JSON Schema object'],
      bottlenecks: ['Missing tool input schema'],
      analyzedPropertiesCount: 0,
    };
  }

  let penalty = 0;
  const issues: string[] = [];
  const bottlenecks: string[] = [];

  const properties = schema.properties || {};
  const propKeys = Object.keys(properties);
  const required = Array.isArray(schema.required) ? schema.required : [];

  // 1. Missing required[] array when properties exist (+25 pts)
  if (propKeys.length > 0 && (!schema.required || required.length === 0)) {
    penalty += 25;
    issues.push('Schema defines properties but omits `required[]` array, causing agent parameter guessing.');
    bottlenecks.push('Missing required[] parameters array');
  }

  let checkedProps = 0;
  for (const [propName, propDef] of Object.entries<any>(properties)) {
    checkedProps++;
    const desc = (propDef.description || '').toLowerCase();
    const nameLower = propName.toLowerCase();

    // 2. Property Name vs Description Keyword Mismatch (+30 pts)
    // Example: name is `amount_cents` but description says `amount in dollars` or vice-versa
    if (
      (nameLower.includes('cent') && desc.includes('dollar') && !desc.includes('cent')) ||
      (nameLower.includes('dollar') && desc.includes('cent') && !desc.includes('dollar')) ||
      (nameLower.includes('ms') && desc.includes('second') && !desc.includes('millisecond')) ||
      (nameLower.includes('sec') && !nameLower.includes('ms') && desc.includes('millisecond'))
    ) {
      penalty += 30;
      issues.push(`Parameter '${propName}' description contradicts property unit (${propDef.description}).`);
      bottlenecks.push(`Unit ambiguity on '${propName}'`);
    }

    // 3. Numeric Fields Typed as Strings (+20 pts)
    if (
      propDef.type === 'string' &&
      (nameLower.includes('count') || nameLower.includes('amount') || nameLower.includes('limit') || nameLower.includes('total') || nameLower.includes('age') || nameLower.includes('year')) &&
      !propDef.pattern && !propDef.format
    ) {
      penalty += 20;
      issues.push(`Numeric parameter '${propName}' is typed as \`string\` without regex pattern or format hint.`);
      bottlenecks.push(`String-coerced number on '${propName}'`);
    }

    // 4. Missing description on required properties (+10 pts)
    if (required.includes(propName) && (!propDef.description || propDef.description.trim().length === 0)) {
      penalty += 10;
      issues.push(`Required parameter '${propName}' is missing a functional description.`);
    }

    // 5. Undefined or any-type properties (+15 pts)
    if (!propDef.type && !propDef.$ref && !propDef.anyOf && !propDef.oneOf) {
      penalty += 15;
      issues.push(`Parameter '${propName}' lacks explicit type definition.`);
    }
  }

  // Normalize 0 to 100
  const normalizedScore = Math.min(100, Math.max(0, penalty));

  let rating: 'Flawless' | 'Low Friction' | 'Medium Friction' | 'High Friction' | 'Hostile' = 'Flawless';
  if (normalizedScore > 75) rating = 'Hostile';
  else if (normalizedScore > 50) rating = 'High Friction';
  else if (normalizedScore > 25) rating = 'Medium Friction';
  else if (normalizedScore > 0) rating = 'Low Friction';

  return {
    score: normalizedScore,
    rating,
    issues,
    bottlenecks,
    analyzedPropertiesCount: checkedProps,
  };
}

export class SchemaFrictionEvaluator {
  static analyzeSchema(schema: any, toolName?: string): SchemaFrictionResult {
    return evaluateSchemaFriction(schema);
  }
}
