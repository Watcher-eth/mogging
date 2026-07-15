import type { GetServerSideProps } from 'next'

export default function CreatorAuthRedirect() { return null }

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/creator', permanent: false },
})
