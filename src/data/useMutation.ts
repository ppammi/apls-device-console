import { useCallback, useRef, useState } from 'react';
import { errorMessage, GraphQLRequestError, request, type Variables } from './client';

export type UseMutationResult<TData, TVars> = {
  loading: boolean;
  errors: string[];
  mutateData: (variables?: TVars, replace?: boolean) => Promise<TData | undefined>;
};

export type UseMutationOptions<TVars> = {
  variables?: TVars;
  /**
   * Default false: most mutations are fired from an onClick and nobody awaits them,
   * so throwing would just be an unhandled rejection; putting the error in `errors`
   * lets the component render it. Flows that must react to failure (rollback) opt in,
   * because "returned undefined" can't be told apart from a successful null result.
   */
  throwError?: boolean;
};

export function useMutation<TData, TVars extends Variables = Variables>(
  query: string,
  options: UseMutationOptions<TVars> = {},
): UseMutationResult<TData, TVars> {
  const { throwError = false } = options;
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const configuredVars = useRef(options.variables);
  configuredVars.current = options.variables;

  const mutateData = useCallback(
    async (vars?: TVars, replace = false) => {
      const finalVars = (replace ? vars : { ...configuredVars.current, ...vars }) ?? {};
      setLoading(true);
      setErrors([]);
      try {
        const result = await request<TData>(query, finalVars);
        if (result.errors.length) {
          setErrors(result.errors);
          if (throwError) throw new GraphQLRequestError(result.errors);
        }
        return result.data;
      } catch (err) {
        if (err instanceof GraphQLRequestError) throw err;
        setErrors([errorMessage(err)]);
        if (throwError) throw err;
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [query, throwError],
  );

  return { loading, errors, mutateData };
}
