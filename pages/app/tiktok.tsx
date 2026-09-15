import type { GetServerSideProps } from 'next'
export const getServerSideProps: GetServerSideProps = async () => ({ redirect: { destination: '/battle', permanent: false } })
export default function TikTokReturn() { return null }
