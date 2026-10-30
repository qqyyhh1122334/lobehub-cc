interface Props {
  footerNote: string;
  iconOnly?: boolean;
  onRangeChange: (range: [Date | null, Date | null]) => void;
  range: [Date | null, Date | null];
}

/** Cloud workflow extraction is unavailable; existing local memories remain readable. */
const AnalysisTrigger = (_props: Props) => null;
export default AnalysisTrigger;
