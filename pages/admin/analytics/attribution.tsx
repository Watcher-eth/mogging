import { adminRedirect } from '@/lib/admin/page'

export default function MovedAdminPage() { return null }
export const getServerSideProps = adminRedirect('/admin/attribution?view=attribution')
