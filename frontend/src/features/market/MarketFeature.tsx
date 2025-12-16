type Props = {
  title?: string
}

export default function MarketFeature({ title = 'Market' }: Props) {
  return <div>{title} feature placeholder</div>
}
