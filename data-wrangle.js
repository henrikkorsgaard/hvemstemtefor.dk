// content of index.js
const http = require('http')


var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/laws');
var Schema = mongoose.Schema;

var lawSchema = new Schema({
	id: {type: Number, required: true, unique:true},
	title: String,
	summary: String,
	lawCode: Number,
	lawDate: Date,
	voteid:Number,
	voteresult: [{
		yes:Number,
		no: Number,
		neither: Number,
		absent: Number
	}],
	caseid: Number,
	votes: [{
		voteid: Number,
		actor: Number
	}]
})

var Law = mongoose.model('Law', lawSchema);

/*
* First step is to get all the signed policy proposals into the database (cases with the specific id that indicate being a policy proposal)
*/


function step_one(){
	queryAPI("http://oda.ft.dk/api/Sag?$expand=Sagstrin&$filter=typeid%20eq%203%20and%20statusid%20eq%2011", (data)=>{
		for(var i = 0; i < data.value.length;  i ++){
			insert(data.value[i])
		}
	})
}


step_two()

function insert(obj){

	var cid;
	var ld = new Date(obj.lovnummerdato)

	for(var i = 0; i < obj.Sagstrin.length; i ++ ){
		if( obj.Sagstrin[i].typeid == 17){
			cid = obj.Sagstrin[i].id
			break;
		}
	}

	var obj = {
		id: obj.id,
		title: obj.titel,
		summary: obj.resume,
		lawCode: obj.lovnummer,
		lawDate: ld,
		caseid: cid,
		votes: [],
		voteresult: {yes:0, no:0, neither:0, absent:0}
	}

	upsert(obj)
}

function upsert(obj){
	Law.findOneAndUpdate({id:obj.id}, obj, {upsert:true}, function(err, doc){
		if(err){
			console.log(err)
		}
    	console.log('Law updated successfully!');
	});
}


/*
	Second step is to add the voting data to the passed proposals. This is a three step process
		First, we fetch the passed proposals from the database (see step_one)
		Second, we query the API for the vote id on the specific case.
		Third, using the vote id, we query the API to get all the votes from the parlement memebers to that specific proposal.
*/

function step_two(){
	Law.find({}, (err, docs)=>{
		if(err){
			console.log(err)
		}


		for(var i = 0; i < docs.length; i ++ ){
			getVotingData(docs[i])
		}
	})
}

/*
	Vote types:
	1 -> yes
	2 -> no
	3 -> absent
	4 -> neither for or againt

*/


function getVotingData(law){
	queryAPI("http://oda.ft.dk/api/Afstemning?$filter=sagstrinid%20eq%20"+law.caseid, (data)=>{
		var voteid = data.value[0].id
		queryUntilDone("http://oda.ft.dk/api/Stemme?$filter=afstemningid%20eq%20"+voteid, (votesdata)=>{
			law.voteid = voteid
			
			for(var i = 0 ; i<votesdata.length; i++){
				var t = votesdata[i].typeid
				var v = {
					actor: votesdata[i][ 'aktørid'],
					type: votesdata[i].typeid
				}

				console.log("geop")
				law.votes.push(v)

				if(t === 1){
					law.voteresult.yes++;
				}

				if(t === 2){
					law.voteresult.no++;
				}

				if(t === 3){
					law.voteresult.neither++;
				}

				if(t === 4){
					law.voteresult.absent++;
				}
			}


			upsert(law)
			

		});			
	})
}

function seeLaw(){

}



function queryUntilDone(url, callback, result){
	
	if(!result){
		result = []
	}

	console.log("Fetching")

	queryAPI(url, (data) =>{
		result = result.concat(data.value)
		
		if(data["odata.nextLink"]){
			setTimeout(()=>{
				queryUntilDone(data["odata.nextLink"], callback, result)
			}, (Math.random()*5000)+2000)
			
		} else {
			callback(result)
		}
	})
}


function queryAPI(url, callback){
	http.get(url, res => {
  		res.setEncoding("utf8");
  		let body = "";
  		res.on("data", data => {
    		body += data;
  		});

  		res.on("end", () => {
  			jsData= JSON.parse(body);
  				callback(jsData)
  			/*
  			try {
  					
  			} catch(e){
  				console.log(body)
  				console.log(url)
  				console.log(e)
  			}*/
  			
   	 	});

   	 	res.on("error", () => {
   	 		console.log("ERROR")
   	 	})
	});
}




