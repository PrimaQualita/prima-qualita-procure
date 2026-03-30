/**
 * Utility to retry Supabase queries when PostgREST connection pool errors occur.
 * The error code 25P02 ("current transaction is aborted") happens when too many
 * concurrent queries saturate the connection pool, causing cascade failures.
 */

const RETRY_DELAY_MS = 300;
const MAX_RETRIES = 2;

/**
 * Wraps a Supabase query promise and retries on transient 25P02 errors.
 */
export async function withRetry<T>(
  queryFn: () => PromiseLike<{ data: T; error: any }>,
  retries = MAX_RETRIES
): Promise<{ data: T; error: any }> {
  const result = await queryFn();
  
  if (result.error?.code === '25P02' && retries > 0) {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return withRetry(queryFn, retries - 1);
  }
  
  return result;
}

/**
 * Runs multiple Supabase queries in batches to avoid overwhelming the connection pool.
 * Instead of firing all at once with Promise.all, splits into smaller batches.
 */
export async function batchQueries<T>(
  queries: Array<() => PromiseLike<{ data: T; error: any }>>,
  batchSize = 6
): Promise<Array<{ data: T; error: any }>> {
  const results: Array<{ data: T; error: any }> = [];
  
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(q => withRetry(q))
    );
    results.push(...batchResults);
  }
  
  return results;
}
