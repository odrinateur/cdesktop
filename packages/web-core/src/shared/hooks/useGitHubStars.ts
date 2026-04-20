import { useQuery } from '@tanstack/react-query';

// TODO: restore real fetch once the cdesktop-ai/cdesktop GitHub repo is published.
async function fetchGitHubStars(): Promise<number> {
  return 0;
}

// async function fetchGitHubStars(): Promise<number | null> {
//   try {
//     const res = await fetch(
//       'https://api.github.com/repos/cdesktop-ai/cdesktop',
//       { cache: 'no-store' }
//     );
//
//     if (!res.ok) {
//       console.warn(`GitHub API error: ${res.status}`);
//       return null;
//     }
//
//     const data = await res.json();
//     if (typeof data?.stargazers_count === 'number') {
//       return data.stargazers_count;
//     }
//
//     return null;
//   } catch (error) {
//     console.warn('Failed to fetch GitHub stars:', error);
//     return null;
//   }
// }

export function useGitHubStars() {
  return useQuery({
    queryKey: ['github-stars'],
    queryFn: fetchGitHubStars,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
  });
}
