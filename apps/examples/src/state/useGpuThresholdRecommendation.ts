import { useQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { gpuThresholdAtom } from './engineState';

async function fetchRecommendedThreshold(): Promise<number> {
  return 1000;
}

export function useGpuThresholdRecommendation() {
  const [threshold, setThreshold] = useAtom(gpuThresholdAtom);
  const query = useQuery({
    queryKey: ['gpu-threshold-recommendation'],
    queryFn: fetchRecommendedThreshold,
    staleTime: 60_000,
  });

  const applyRecommendation = () => {
    if (typeof query.data === 'number') {
      setThreshold(query.data);
    }
  };

  return {
    threshold,
    setThreshold,
    recommended: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    applyRecommendation,
  };
}
