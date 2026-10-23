import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const params = new URLSearchParams({ new: '1' })
  if (typeof query.sprint === 'string') params.set('sprint', query.sprint)
  return {
    redirect: {
      destination: `/creator/submissions?${params}`,
      permanent: false,
    },
  }
}

export default function SubmitPage() {
  return null
}
