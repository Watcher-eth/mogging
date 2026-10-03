import type { GetServerSideProps } from 'next'
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/creator/money?tab=methods', permanent: false },
})
export default function PayoutInformationRedirect() {
  return null
}
