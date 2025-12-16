type Props = {
  title?: string
}

export default function LogsFeature({ title = 'Logs' }: Props) {
  return <div>{title} feature placeholder</div>
}
