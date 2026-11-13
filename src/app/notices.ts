// 제3자 고지의 원문(8-1, 8-2). 빌드가 만드는 파일(`npm run build:notices`)을 글자로 가져와 설정의 '정보' 구역에 보인다.
// 파일은 배포물에도 그대로 실린다(`dist/THIRD-PARTY-NOTICES.txt`). 낡았는지는 `npm run validate`(곧 build)가 본다.
import NOTICES_TEXT from '../../public/THIRD-PARTY-NOTICES.txt?raw';

export const NOTICES: string = NOTICES_TEXT;
