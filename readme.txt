目标网站：https://jxgxkm.wsglw.net/
课程目录：https://jxgxkm.wsglw.net/train/courseware/list?cid=******
播放界面：https://jxgxkm.wsglw.net/train/courseware/cc?cwid=******

参考页面html：./course.js
需求：制作脚本，自动观看视频，AI答题，检测到需要app扫二维码人脸识别时，转发二维码到通知渠道（企业微信webhook）提醒用户需扫码才能继续进行

课程界面dom
课程一 ：传承红医薪火 勇担时代使命
<a href="/train/courseware/cc?cwid=39f563b8-40cb-4156-933e-b44f009a2ffe" target="region_courseWare">传承红医薪火 勇担时代使命</a>
xpath：/html/body/div[3]/div[2]/div/ul/li[1]/p/a
cssselector：#listBox > div > ul > li:nth-child(1) > p > a

状态：未完成
课程二：儿童口腔早期矫治风险管理与防范
<a href="/train/courseware/cc?cwid=cf9c8ffc-0c97-4279-b369-b44f009a421d" target="region_courseWare">儿童口腔早期矫治风险管理与防范</a>
xpath：/html/body/div[3]/div[2]/div/ul/li[1]/span
cssselector：#listBox > div > ul > li:nth-child(2) > p 

课程三 ：
...
...

.............................
播放界面dom
课程一 ：传承红医薪火 勇担时代使命
xpath：/html/body/div[1]/div/div[2]/div[1]/div[1]/ol/li[1]/p/text()
播放/暂停按钮：
<span class="bf" onclick="custom_player_play(this,'72A2D00B2C42E4C9753C612EB38A8D5A');" style="display:none;"></span>
<span class="zt" onclick="custom_player_pause(this,'72A2D00B2C42E4C9753C612EB38A8D5A');"></span>

课程二：儿童口腔早期矫治风险管理与防范
xpath：/html/body/div[1]/div/div[2]/div[1]/div[1]/ol/li[2]/p/text()


下一节课跳转会触发扫二维码界面
网址：https://jxgxkm.wsglw.net/train/courseware/facevalid?cwid=cf9c8ffc-0c97-4279-b369-b44f009a421d&from=1
二维码:<img id="imgQRCode" src="data:image/png;base64,********" alt="" style="float: left; margin: 10%;">
cssselector:#imgQRCode
xpath:/html/body/div[3]/div/div/div[1]/img[1]


课程中触发签到（重新进入观看可以绕过，过1分钟又会触发，点击”点击签到“可通过）
xpath：/html/body/div/div/div[1]/div[2]/div/div[5]/div/div[2]/div[3]/span
<span class="signBtn">点击签到</span>


看完一节课需要考试（考试要扫二维码）
进入考试按钮：<span style="background: #999999;" class="jrks"><a id="jrks" onclick="alert('视频观看完成后，才能进入考试');">进入考试</a></span>
xpath：/html/body/div[1]/div/div[2]/div[3]/div/span[2]/a
 样式：   text-align: center;
    line-height: 40px;
    cursor: pointer;
    border: 0;
    margin: 0;
    padding: 0;
    font-size: 100%;
    font-family: "Helvetica Neue",Helvetica,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","微软雅黑",Arial,sans-serif;
    text-decoration: none;
    color: #fff;








