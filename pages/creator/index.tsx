import type { GetServerSideProps } from 'next'

export default function CreatorIndex() { return null }

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/creator/submit', permanent: false },
})
